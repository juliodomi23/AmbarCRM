import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";

for (const valor of [process.env.DATABASE_URL, process.env.ADMIN_DATABASE_URL]) {
  if (!valor) throw new Error("Define DATABASE_URL y ADMIN_DATABASE_URL");
  const url = new URL(valor);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/app_movil_test") {
    throw new Error("La prueba solo admite localhost/app_movil_test");
  }
}

const admin = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
const { db, dbRaw, runWithOrg } = await import("../src/lib/db");
const { avisarHandoff, avisarMensajeEntrante, debeAvisarMensajeEntrante } = await import("../src/lib/services/push-atencion");

type Llamada = { titulo: string; cuerpo: string; url: string; usuarioId?: bigint; tipo?: string };
const llamadas: Llamada[] = [];
const enviarPush = async (titulo: string, cuerpo: string, url: string, usuarioId?: bigint, tipo?: "mensaje" | "atencion_humana") => {
  llamadas.push({ titulo, cuerpo, url, usuarioId, tipo });
};

async function main() {
  assert.equal(debeAvisarMensajeEntrante(false, true), true, "sin bot avisa");
  assert.equal(debeAvisarMensajeEntrante(true, true), false, "bot activo silencia");
  assert.equal(debeAvisarMensajeEntrante(true, false), true, "bot apagado avisa");
  await avisarMensajeEntrante(enviarPush, { nombre: "Contacto", cuerpo: "Mensaje", conversacionId: 11n, responsableId: 22n });
  await avisarMensajeEntrante(enviarPush, { nombre: "Contacto", cuerpo: "Mensaje", conversacionId: 12n, responsableId: null });
  assert.equal(llamadas[0].usuarioId, 22n, "asignada solo al responsable");
  assert.equal(llamadas[1].usuarioId, undefined, "sin responsable avisa a la organización");

  await avisarHandoff(enviarPush, { escalada: true, responsableId: 22n }, { nombre: "Contacto", conversacionId: 13n });
  assert.equal(llamadas.length, 3, "un handoff confirmado manda un aviso");
  assert.deepEqual(llamadas[2], {
    titulo: "Contacto", cuerpo: "Requiere atención humana", url: "/chat?conv=13", usuarioId: 22n, tipo: "atencion_humana"
  });
  await avisarHandoff(enviarPush, { escalada: false, responsableId: 22n }, { nombre: "Contacto", conversacionId: 13n });
  await avisarHandoff(enviarPush, null, { nombre: "Contacto", conversacionId: 13n });
  assert.equal(llamadas.length, 3, "handoff repetido o ausente no vuelve a avisar");

  const servicioBots = await readFile(new URL("../src/lib/services/bots.ts", import.meta.url), "utf8");
  const inicioApagado = servicioBots.indexOf("export async function apagarBotPorRespuestaHumana");
  const finApagado = servicioBots.indexOf("\n}\n", inicioApagado);
  assert.ok(inicioApagado >= 0 && finApagado > inicioApagado, "encuentra el apagado por respuesta humana");
  assert.doesNotMatch(servicioBots.slice(inicioApagado, finApagado), /avisarHandoff|avisarMensajeEntrante|enviarPushAOrg/,
    "apagar el bot por respuesta humana no dispara notificaciones");

  const queFalla = async () => { throw new Error("fallo simulado"); };
  await assert.doesNotReject(() => avisarMensajeEntrante(queFalla, { nombre: "Contacto", cuerpo: "Mensaje", conversacionId: 14n, responsableId: null }));
  await assert.doesNotReject(() => avisarHandoff(queFalla, { escalada: true, responsableId: null }, { nombre: "Contacto", conversacionId: 14n }));

  const sufijo = Date.now().toString(36);
  const orgA = await admin.query<{ id: string }>("INSERT INTO orgs(nombre,slug) VALUES($1,$2) RETURNING id", ["Push prueba A", `push-a-${sufijo}`]);
  const orgB = await admin.query<{ id: string }>("INSERT INTO orgs(nombre,slug) VALUES($1,$2) RETURNING id", ["Push prueba B", `push-b-${sufijo}`]);
  const a = BigInt(orgA.rows[0].id), b = BigInt(orgB.rows[0].id);
  const ua = await admin.query<{ id: string }>("INSERT INTO usuarios(org_id,nombre,email,password_hash,rol) VALUES($1,'Agente A',$2,'x','admin') RETURNING id", [String(a), `push-a-${sufijo}@prueba.test`]);
  const ub = await admin.query<{ id: string }>("INSERT INTO usuarios(org_id,nombre,email,password_hash,rol) VALUES($1,'Agente B',$2,'x','admin') RETURNING id", [String(b), `push-b-${sufijo}@prueba.test`]);
  const usuarioA = BigInt(ua.rows[0].id), usuarioB = BigInt(ub.rows[0].id);
  await runWithOrg(a, async () => { await db.dispositivoPush.create({ data: { usuarioId: usuarioA, tokenFcm: `push-test-a-${sufijo}`, plataforma: "android" } }); });
  await runWithOrg(b, async () => { await db.dispositivoPush.create({ data: { usuarioId: usuarioB, tokenFcm: `push-test-b-${sufijo}`, plataforma: "android" } }); });
  assert.equal((await runWithOrg(a, () => db.dispositivoPush.findMany({ where: { usuarioId: usuarioA } })).then((r) => r.length)), 1);
  assert.equal((await runWithOrg(a, () => db.dispositivoPush.findMany({ where: { usuarioId: usuarioB } })).then((r) => r.length)), 0, "RLS impide ver dispositivos de otra org");
  assert.equal((await runWithOrg(b, () => db.dispositivoPush.findMany({ where: { usuarioId: usuarioA } })).then((r) => r.length)), 0, "otra org no ve el dispositivo asignado");
}

try {
  await main();
  console.log("check-push-atencion-humana OK: reglas, idempotencia, destinatarios, errores y aislamiento RLS");
} finally {
  await admin.end();
  await dbRaw.$disconnect();
}
