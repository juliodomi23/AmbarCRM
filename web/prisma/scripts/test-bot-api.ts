/**
 * API del bot (/api/v1): aislamiento entre canales, 429, etiquetas vs. bot, tareas, handoff con
 * round-robin concurrente, firma HMAC y bitácora. Llama a los handlers directamente.
 *
 * ADMIN_DATABASE_URL=<dueño> DATABASE_URL=<crm_app> META_TOKEN_ENCRYPTION_KEY=<base64 32 bytes> \
 *   npx tsx prisma/scripts/test-bot-api.ts
 * Solo contra una BD desechable.
 */
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw } from "../../src/lib/db";
import { requireBot } from "../../src/lib/bot-auth";
import { decryptMetaToken } from "../../src/lib/meta/credentials";
import { encryptMetaToken } from "../../src/lib/meta/credentials";
import { esperarWebhooks } from "../../src/lib/webhooks-salientes";
import {
  dispatchABot,
  elegirAsesor,
  escalarAHumano,
  firmarCuerpo,
  firmarCuerpoV2,
  listarBots,
  nuevoSecretoFirma,
} from "../../src/lib/services/bots";
import { runWithOrg } from "../../src/lib/db";
import { transaccionTenant } from "../../src/lib/retail-db";
import { auditarBot } from "../../src/lib/services/bots";
import { GET as getConversacion } from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/route";
import { GET as getConversaciones } from "../../src/app/api/v1/accounts/[accountId]/conversations/route";
import { GET as getMensajes } from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/messages/route";
import { POST as postLabels } from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/labels/route";
import { POST as postTasks } from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/tasks/route";
import { POST as postMessages } from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/messages/route";
import { PATCH as patchStatus } from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/status/route";
import { POST as postAssignments } from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/assignments/route";
import { POST as postFunnel } from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/funnel/route";
import {
  GET as getCitas,
  PATCH as patchCitas,
  POST as postCitas,
} from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/appointments/route";
import { GET as getDisponibilidad } from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/appointments/availability/route";
import {
  GET as getCotizaciones,
  POST as postCotizaciones,
} from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/quotes/route";
import { POST as postEnviarCotizacion } from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/quotes/[quoteId]/send/route";
import { GET as getProductos } from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/products/route";
import { PATCH as patchOportunidad } from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/opportunity/route";
import {
  GET as getContactos,
  PATCH as patchContactos,
  POST as postContactos,
} from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/contacts/route";
import { PERMISOS_BOT, PERMISOS_MINIMOS, permisosValidos } from "../../src/lib/bot-permisos";
import { readFile } from "node:fs/promises";
import { fechaLocal, instanteLocal, sumarDias } from "../../src/lib/reservas/horarios";
import { reprogramarCita, reservarCita } from "../../src/lib/reservas/servidor";

const TODOS_SQL = `ARRAY[${PERMISOS_BOT.map((p) => `'${p}'`).join(",")}]::text[]`;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl || !process.env.DATABASE_URL || !process.env.META_TOKEN_ENCRYPTION_KEY) {
  throw new Error("Define ADMIN_DATABASE_URL, DATABASE_URL (crm_app) y META_TOKEN_ENCRYPTION_KEY");
}
const admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
const sufijo = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const orgId = BigInt(Date.now()) * 1000n + 777n;

async function q<T = Record<string, unknown>>(sql: string, valores: unknown[] = []) {
  return (await admin.query(sql, valores)).rows as T[];
}

async function probarBackfillConversaciones() {
  const tabla = `conversaciones_backfill_test_${Date.now()}`;
  const sql = await readFile("prisma/sql/actualizaciones.sql", "utf8");
  const bloque = sql.slice(sql.indexOf("-- Lectura cronológica de conversaciones"))
    .match(/DO \$\$[\s\S]*?END \$\$;/)?.[0];
  assert.ok(bloque, "backfill de updated_at presente");
  await q(`CREATE TABLE ${tabla} (id BIGINT, org_id BIGINT, estado estado_conv,
    created_at TIMESTAMPTZ NOT NULL, ultimo_mensaje_at TIMESTAMPTZ)`);
  try {
    await q(`INSERT INTO ${tabla} (id, org_id, estado, created_at, ultimo_mensaje_at) VALUES
      (1, 1, 'abierta', '2020-01-01', '2021-01-01'),
      (2, 1, 'abierta', '2020-02-01', NULL)`);
    const migrar = bloque.replaceAll("conversaciones", tabla);
    await q(migrar);
    const leer = () => q<{ updated_at: Date }>(`SELECT updated_at FROM ${tabla} ORDER BY id`);
    const fechas = await leer();
    assert.equal(fechas[0].updated_at.toISOString(), "2021-01-01T00:00:00.000Z");
    assert.equal(fechas[1].updated_at.toISOString(), "2020-02-01T00:00:00.000Z");
    await q(`UPDATE ${tabla} SET updated_at='2022-01-01' WHERE id=1`);
    await q(migrar);
    assert.equal((await leer())[0].updated_at.toISOString(), "2022-01-01T00:00:00.000Z", "backfill solo se ejecuta una vez");
  } finally {
    await q(`DROP TABLE IF EXISTS ${tabla}`);
  }
}
const uno = async (sql: string, v: unknown[] = []) => (await q<{ id: string }>(sql, v))[0].id;

/**
 * Los handlers se sirven desde un servidor HTTP real y se llaman por red, como en producción: cada
 * petición nace en un contexto async limpio. Llamarlos directo mezclaría el tenant de una llamada con
 * el de la siguiente (setOrg usa AsyncLocalStorage.enterWith, que no sobrescribe un tenant ya fijado).
 */
type Handler = (req: NextRequest, p: any) => Promise<Response | undefined>;
const handlers: Handler[] = [];
const servidor = http.createServer((entrante, saliente) => {
  const partes: Buffer[] = [];
  entrante.on("data", (c) => partes.push(c));
  entrante.on("end", async () => {
    try {
      const handler = handlers[Number(entrante.headers["x-test-handler"])];
      const params = JSON.parse(String(entrante.headers["x-test-params"]));
      const headers = new Headers();
      for (const [k, v] of Object.entries(entrante.headers)) {
        if (!k.startsWith("x-test-") && typeof v === "string") headers.set(k, v);
      }
      const cuerpo = Buffer.concat(partes);
      const req = new NextRequest(`http://prueba.local${entrante.url}`, {
        method: entrante.method,
        headers,
        body: cuerpo.length ? cuerpo : undefined,
      });
      const res = (await handler(req, { params: Promise.resolve(params) }))!;
      saliente.writeHead(res.status, Object.fromEntries(res.headers));
      saliente.end(Buffer.from(await res.arrayBuffer()));
    } catch (error) {
      saliente.writeHead(599);
      saliente.end(String(error));
    }
  });
});
// Tope de conexiones simultáneas: 400 a la vez desbordan la cola de escucha en Windows (ECONNREFUSED).
const agente = new http.Agent({ keepAlive: false, maxSockets: 50 });

type Opciones = { query?: string; metodo?: string; params?: Record<string, string>; headers?: Record<string, string> };

function llamar(
  handler: Handler,
  token: string | null,
  conversacionId: string,
  cuerpo?: unknown,
  opciones: Opciones = {},
) {
  let id = handlers.indexOf(handler);
  if (id < 0) id = handlers.push(handler) - 1;
  const texto = cuerpo === undefined ? undefined : JSON.stringify(cuerpo);
  return new Promise<Response>((resolver, rechazar) => {
    const peticion = http.request(
      {
        host: "127.0.0.1",
        port: (servidor.address() as AddressInfo).port,
        path: `/api/v1/accounts/1/conversations/${conversacionId}/x${opciones.query ?? ""}`,
        method: opciones.metodo ?? (cuerpo === undefined ? "GET" : "POST"),
        agent: agente,
        headers: {
          "content-type": "application/json",
          "x-test-handler": String(id),
          "x-test-params": JSON.stringify({ accountId: "1", conversationId: conversacionId, ...(opciones.params ?? {}) }),
          ...(token ? { api_access_token: token } : {}),
          ...(opciones.headers ?? {}),
        },
      },
      (respuesta) => {
        const partes: Buffer[] = [];
        respuesta.on("data", (c) => partes.push(c));
        respuesta.on("end", () => {
          const status = respuesta.statusCode ?? 0;
          if (status === 599) return rechazar(new Error(Buffer.concat(partes).toString()));
          const encabezados = new Headers();
          for (const [k, v] of Object.entries(respuesta.headers)) if (typeof v === "string") encabezados.set(k, v);
          resolver(new Response(Buffer.concat(partes), { status, headers: encabezados }));
        });
      },
    );
    peticion.on("error", rechazar);
    peticion.end(texto);
  });
}

/** Notas internas "🤖 …" que el CRM dejó en la conversación por acciones del bot, en orden. */
const notasBot = (conversacionId: string) =>
  q<{ contenido: string }>("SELECT contenido FROM mensajes WHERE conversacion_id=$1 AND interna AND contenido LIKE '🤖%' ORDER BY id", [conversacionId]);
const textosNotasBot = async (conversacionId: string) => (await notasBot(conversacionId)).map((n) => n.contenido);

async function main() {
  await probarBackfillConversaciones();
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  // ---------- Datos ----------
  await q("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Bot API', $2)", [orgId.toString(), `bot-api-${sufijo}`]);
  const o = orgId.toString();
  const canalA = await uno(`INSERT INTO canales_whatsapp (org_id, nombre) VALUES ($1,'A') RETURNING id::text AS id`, [o]);
  const canalB = await uno(`INSERT INTO canales_whatsapp (org_id, nombre) VALUES ($1,'B') RETURNING id::text AS id`, [o]);
  const token = (n: string) => `t-${n}-${sufijo}`;
  const bot = async (n: string, canal: string | null) =>
    uno(
      `INSERT INTO bots (org_id, nombre, webhook_url, api_token, canal_id, permisos) VALUES ($1,$2,'https://8.8.8.8/hook',$3,$4,${TODOS_SQL}) RETURNING id::text AS id`,
      [o, n, token(n), canal],
    );
  const botA = await bot("A", canalA);
  await bot("B", canalB);
  await bot("global", null);
  await bot("rl", null);

  const usuarios: string[] = [];
  for (const n of ["u1", "u2", "u3"]) {
    usuarios.push(
      await uno(
        `INSERT INTO usuarios (org_id, nombre, email, password_hash) VALUES ($1,$2,$3,'x') RETURNING id::text AS id`,
        [o, n, `${n}-${sufijo}@prueba.local`],
      ),
    );
  }
  const embudo = await uno(`INSERT INTO embudos (org_id, nombre) VALUES ($1,'E') RETURNING id::text AS id`, [o]);
  await q(`INSERT INTO etapas (org_id, embudo_id, nombre, orden) VALUES ($1,$2,'Nuevo',0), ($1,$2,'Contactado',1)`, [o, embudo]);
  let telefonos = 0;
  const contacto = async (n: number) =>
    uno(`INSERT INTO contactos (org_id, nombre, telefono) VALUES ($1,$2,$3) RETURNING id::text AS id`, [o, `C${n}`, `52${Date.now()}${telefonos++}`]);
  const conversacion = async (n: number, canal = canalA) =>
    uno(
      `INSERT INTO conversaciones (org_id, contacto_id, canal_id) VALUES ($1,$2,$3) RETURNING id::text AS id`,
      [o, await contacto(n), canal],
    );
  const conv = await conversacion(0);
  const contactoId = (await q<{ contacto_id: string }>("SELECT contacto_id::text FROM conversaciones WHERE id=$1", [conv]))[0].contacto_id;
  // Timestamps explícitos y distintos (1 s entre mensajes): con el default now() dos inserts seguidos
  // podían empatar en el mismo milisegundo y el orden "últimos 20" dejaba de ser determinista.
  const inicio = Date.now() - 60_000;
  for (let i = 1; i <= 25; i++) {
    await q(
      `INSERT INTO mensajes (org_id, conversacion_id, direccion, contenido, interna, "timestamp") VALUES ($1,$2,$3,$4,$5,$6)`,
      [o, conv, i % 2 ? "entrante" : "saliente", `m${i}`, i === 25, new Date(inicio + i * 1000)],
    );
  }
  const auditoria = (accion: string) =>
    q<{ despues: Record<string, unknown> | null }>(
      "SELECT despues FROM auditoria_bot WHERE org_id=$1 AND accion=$2 ORDER BY id",
      [o, accion],
    );

  // ---------- 1. Aislamiento entre canales + campos nuevos y antiguos ----------
  assert.equal((await llamar(getConversacion, token("B"), conv)).status, 403, "bot del canal B no debe leer el canal A");
  assert.equal((await llamar(getConversacion, null, conv)).status, 401);
  const ok = await llamar(getConversacion, token("A"), conv);
  assert.equal(ok.status, 200);
  const datos = await ok.json();
  for (const clave of ["id", "status", "bot_activo", "labels", "can_reply", "meta"]) assert.ok(clave in datos, `conserva ${clave}`);
  assert.equal((await llamar(getConversacion, token("global"), conv)).status, 200);

  // ---------- 2. Perfil y últimos 20 mensajes (sin notas internas) ----------
  assert.equal(datos.mensajes.length, 20);
  assert.equal(datos.mensajes.at(-1).content, "m24", "la nota interna m25 no se expone; orden cronológico");
  assert.equal(datos.mensajes[0].content, "m5");
  assert.deepEqual(datos.perfil.etiquetas, []);
  assert.equal(datos.perfil.oportunidad, null);

  // ---------- 3. Etiquetas: guardan y NO reactivan el bot ----------
  await q("UPDATE conversaciones SET bot_activo=false WHERE id=$1", [conv]);
  const r1 = await llamar(postLabels, token("A"), conv, { labels: ["interesado", "vip"] });
  assert.equal(r1.status, 200);
  const cuerpo1 = await r1.json();
  assert.deepEqual(cuerpo1.payload, ["interesado", "vip"], "conserva payload");
  assert.equal((await q("SELECT bot_activo FROM conversaciones WHERE id=$1", [conv]))[0].bot_activo, false, "etiquetar no reactiva");
  assert.equal(
    (await q(`SELECT count(*)::int n FROM contacto_etiquetas ce JOIN etiquetas e ON e.id=ce.etiqueta_id WHERE ce.contacto_id=$1 AND e.nombre IN ('interesado','vip')`, [contactoId]))[0].n,
    2,
  );
  await llamar(postLabels, token("A"), conv, { labels: [] });
  assert.equal((await q("SELECT bot_activo FROM conversaciones WHERE id=$1", [conv]))[0].bot_activo, false, "labels vacío tampoco reactiva");
  await llamar(postLabels, token("A"), conv, { labels: ["bot_on"] });
  assert.equal((await q("SELECT bot_activo FROM conversaciones WHERE id=$1", [conv]))[0].bot_activo, true, "bot_on reactiva");
  assert.equal((await auditoria("bot_reactivado")).length, 1);

  // bot_on con responsable humano: 409, el bot sigue apagado y queda en la bitácora.
  await q("UPDATE conversaciones SET bot_activo=false, responsable_id=$2 WHERE id=$1", [conv, usuarios[0]]);
  const rechazo = await llamar(postLabels, token("A"), conv, { labels: ["bot_on"] });
  assert.equal(rechazo.status, 409);
  assert.equal((await rechazo.json()).motivo, "asignada_a_humano");
  assert.equal((await q("SELECT bot_activo FROM conversaciones WHERE id=$1", [conv]))[0].bot_activo, false, "con responsable el bot sigue apagado");
  assert.equal((await auditoria("bot_reactivado")).length, 1, "no se registró una reactivación");
  const rechazos = await auditoria("bot_reactivado_rechazado");
  assert.equal(rechazos.length, 1, "el rechazo quedó en auditoria_bot");
  assert.equal((rechazos[0].despues as { motivo: string }).motivo, "asignada_a_humano");
  // Sin responsable vuelve a reactivar, y el estado de la conversación queda como al inicio de la prueba.
  await q("UPDATE conversaciones SET responsable_id=NULL WHERE id=$1", [conv]);
  assert.equal((await llamar(postLabels, token("A"), conv, { labels: ["bot_on"] })).status, 200);
  assert.equal((await q("SELECT bot_activo FROM conversaciones WHERE id=$1", [conv]))[0].bot_activo, true, "sin responsable, bot_on reactiva");
  assert.equal((await auditoria("bot_reactivado")).length, 2);
  assert.equal((await llamar(getConversacion, token("A"), conv).then((r) => r.json())).perfil.etiquetas.length, 2);

  // ---------- 4. Handoff: apaga, pendiente, asesor, nota interna, bitácora, idempotente ----------
  const h = await (await llamar(postLabels, token("A"), conv, { labels: ["escalado_humano"], motivo: "pide hablar con alguien" })).json();
  assert.equal(h.handoff.escalada, true);
  const c = (await q<{ bot_activo: boolean; estado: string; responsable_id: string }>("SELECT bot_activo, estado, responsable_id::text FROM conversaciones WHERE id=$1", [conv]))[0];
  assert.equal(c.bot_activo, false);
  assert.equal(c.estado, "pendiente");
  assert.ok(usuarios.includes(c.responsable_id), "asignó un usuario activo");
  const notas = await q<{ contenido: string }>("SELECT contenido FROM mensajes WHERE conversacion_id=$1 AND interna AND contenido LIKE 'Handoff del bot%'", [conv]);
  assert.equal(notas.length, 1);
  assert.match(notas[0].contenido, /pide hablar con alguien/);
  await llamar(postLabels, token("A"), conv, { labels: ["escalado_humano"] });
  assert.equal((await q("SELECT count(*)::int n FROM mensajes WHERE conversacion_id=$1 AND contenido LIKE 'Handoff del bot%'", [conv]))[0].n, 1, "segundo handoff no duplica");
  assert.equal((await auditoria("handoff")).length, 1);

  // asesor fijo del bot
  await q("UPDATE bots SET asesor_id=$1 WHERE id=$2", [usuarios[2], botA]);
  const convFijo = await conversacion(90);
  await llamar(postLabels, token("A"), convFijo, { labels: ["bot_off"] });
  assert.equal((await q("SELECT responsable_id::text r FROM conversaciones WHERE id=$1", [convFijo]))[0].r, usuarios[2]);
  await q("UPDATE bots SET asesor_id=NULL WHERE id=$1", [botA]);

  // ---------- 5. Tareas ----------
  const t = await llamar(postTasks, token("A"), conv, { titulo: "Llamar mañana", venceAt: "2026-12-01T10:00:00Z", responsableId: usuarios[0] });
  assert.equal(t.status, 200);
  const tarea = await t.json();
  assert.equal(tarea.responsable_id, usuarios[0]);
  assert.equal(
    (await q("SELECT count(*)::int n FROM tareas t JOIN oportunidades o ON o.id=t.oportunidad_id WHERE t.id=$1 AND o.contacto_id=$2", [tarea.id, contactoId]))[0].n,
    1,
  );
  assert.equal((await llamar(postTasks, token("A"), conv, { titulo: "" })).status, 400);
  assert.equal((await llamar(postTasks, token("B"), conv, { titulo: "x" })).status, 403);
  assert.equal((await auditoria("tarea_creada")).length, 1);

  // ---------- 6. Bitácora: etapa y nota interna ----------
  assert.equal((await llamar(postFunnel, token("A"), conv, { etapa: "Contactado" })).status, 200);
  assert.equal((await auditoria("mover_etapa")).length, 1);
  assert.equal((await llamar(postMessages, token("A"), conv, { content: "recordar documento", private: true })).status, 200);
  assert.equal((await auditoria("nota_interna")).length, 1);

  // ---------- 6B. Lo que hace el bot queda como nota interna "🤖" en el chat ----------
  assert.deepEqual(
    await textosNotasBot(conv),
    [
      "🤖 Etiquetó: interesado, vip",
      "🤖 Reactivó el bot",
      "🤖 Reactivó el bot",
      "🤖 Creó tarea: Llamar mañana",
      "🤖 Movió a etapa: Contactado",
    ],
    "una nota por acción efectiva; el 409 de bot_on, las etiquetas vacías y el handoff no suman notas 🤖",
  );
  const lecturaBot = await (await llamar(getConversacion, token("A"), conv)).json();
  assert.ok(
    !lecturaBot.mensajes.some((m: { content: string }) => m.content.includes("🤖") || m.content.startsWith("Handoff del bot")),
    "GET de la conversación no entrega al bot las notas internas",
  );
  assert.ok(!JSON.stringify(lecturaBot).includes("🤖"), "tampoco aparecen en el perfil");

  // Repetir la misma etiqueta o la misma etapa no vuelve a escribir en el chat.
  await llamar(postLabels, token("A"), conv, { labels: ["interesado"] });
  await llamar(postFunnel, token("A"), conv, { etapa: "Contactado" });
  assert.equal((await notasBot(conv)).length, 5, "sin cambios no hay notas nuevas");
  // El handoff ya deja su propia nota: no se duplica con una "🤖".
  const convHandoff = await conversacion(95);
  await llamar(postLabels, token("A"), convHandoff, { labels: ["escalado_humano"], motivo: "quiere un asesor" });
  assert.equal((await notasBot(convHandoff)).length, 0);
  assert.equal(
    (await q("SELECT count(*)::int n FROM mensajes WHERE conversacion_id=$1 AND interna", [convHandoff]))[0].n,
    1,
    "el handoff deja una sola nota (la suya)",
  );

  // Tiempo real: insertar la nota dispara el mismo NOTIFY del chat (trigger de mensajes).
  const escucha = new pg.Client({ connectionString: adminUrl });
  await escucha.connect();
  await escucha.query("LISTEN nuevo_mensaje");
  const avisos: { conversacion_id: number; direccion: string; org_id: number }[] = [];
  escucha.on("notification", (n) => n.payload && avisos.push(JSON.parse(n.payload)));
  const convVivo = await conversacion(96);
  await llamar(postLabels, token("A"), convVivo, { labels: ["en-vivo"] });
  for (let i = 0; i < 50 && !avisos.some((a) => String(a.conversacion_id) === convVivo); i++) await new Promise((r) => setTimeout(r, 100));
  await escucha.end();
  const aviso = avisos.find((a) => String(a.conversacion_id) === convVivo);
  assert.ok(aviso, "el etiquetado del bot emitió el evento nuevo_mensaje de la conversación");
  assert.equal(String(aviso.org_id), o, "el evento lleva la empresa");

  // ---------- 7. 429 por token ----------
  process.env.BOT_RATE_LIMIT_MAX = "3";
  const limitado = token("rl");
  const estados: number[] = [];
  for (let i = 0; i < 5; i++) estados.push((await llamar(getConversacion, limitado, conv)).status);
  delete process.env.BOT_RATE_LIMIT_MAX;
  assert.deepEqual(estados.slice(0, 3), [200, 200, 200]);
  assert.ok(estados.includes(429), `esperaba 429, obtuve ${estados}`);
  assert.equal((await llamar(getConversacion, token("A"), conv)).status, 200, "otro token no se ve afectado");

  // ---------- 8. Firma HMAC ----------
  assert.equal(
    firmarCuerpo("Jefe", "what do ya want for nothing?"),
    "sha256=5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    "vector RFC 4231 #2",
  );
  const secreto = nuevoSecretoFirma();
  assert.equal(decryptMetaToken(secreto.cifrado), secreto.plano);
  assert.ok(secreto.cifrado.startsWith("encv1:") && !secreto.cifrado.includes(secreto.plano));
  const fetchReal = globalThis.fetch;
  let capturado: { headers: Record<string, string>; body: string } | null = null;
  globalThis.fetch = (async (_u: unknown, init: RequestInit) => {
    capturado = { headers: init.headers as Record<string, string>, body: String(init.body) };
    return new Response("ok");
  }) as typeof fetch;
  try {
    await dispatchABot(
      { webhookUrl: "https://8.8.8.8/hook", signingSecret: secreto.cifrado },
      { conversacionId: 1n, contactoId: 1n, telefono: "1", nombre: "n", botActivo: true, mensaje: { id: 1n, tipo: "texto", contenido: "hola", mediaUrl: null } },
    );
  } finally {
    globalThis.fetch = fetchReal;
  }
  assert.ok(capturado, "dispatch llamó a fetch");
  const enviado = capturado as { headers: Record<string, string>; body: string };
  assert.equal(enviado.headers["X-AmbarCRM-Signature"], firmarCuerpo(secreto.plano, enviado.body));

  // Firma V2 con marca de tiempo: la V1 queda igual y la V2 solo verifica con el timestamp original.
  const ts = enviado.headers["X-AmbarCRM-Timestamp"];
  assert.match(ts, /^\d{10}$/, "timestamp en segundos unix");
  assert.ok(Math.abs(Date.now() / 1000 - Number(ts)) < 60, "timestamp reciente");
  const v2 = enviado.headers["X-AmbarCRM-Signature-V2"];
  assert.equal(v2, firmarCuerpoV2(secreto.plano, ts, enviado.body), "V2 válida verifica");
  assert.notEqual(v2, firmarCuerpoV2(secreto.plano, String(Number(ts) + 1), enviado.body), "timestamp alterado no verifica");
  assert.notEqual(v2, firmarCuerpoV2(secreto.plano, ts, enviado.body + " "), "cuerpo alterado no verifica");
  assert.notEqual(v2, enviado.headers["X-AmbarCRM-Signature"], "V2 distinta de V1");

  // El secreto nunca sale en lo que usa la UI.
  const botConSecreto = await uno(
    `INSERT INTO bots (org_id, nombre, webhook_url, api_token, signing_secret, permisos) VALUES ($1,'firma','https://8.8.8.8/h',$2,$3,${TODOS_SQL}) RETURNING id::text AS id`,
    [o, token("firma"), secreto.cifrado],
  );
  const lista = await runWithOrg(orgId, () => listarBots());
  const serializada = JSON.stringify(lista, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  assert.ok(!serializada.includes("signingSecret") && !serializada.includes(secreto.cifrado), "listarBots no filtra el secreto");
  assert.ok(lista.find((b) => b.id.toString() === botConSecreto)?.firmaActiva);

  // ---------- 9. Concurrencia del round-robin ----------
  async function rondas(bloquear: boolean, pares: number) {
    await q("DELETE FROM auditoria_bot WHERE org_id=$1 AND accion='handoff'", [o]);
    let colisiones = 0;
    for (let i = 0; i < pares; i++) {
      const [a, b] = [await conversacion(200 + i * 2), await conversacion(201 + i * 2)];
      const botObj = { id: BigInt(botA), orgId, asesorId: null };
      const [ra, rb] = await Promise.all([
        escalarAHumano(botObj, BigInt(a), "prueba", bloquear),
        escalarAHumano(botObj, BigInt(b), "prueba", bloquear),
      ]);
      if (ra?.responsableId === rb?.responsableId) colisiones++;
    }
    return colisiones;
  }
  const sinLock = await rondas(false, 15);
  const conLock = await rondas(true, 15);
  console.log(`concurrencia (15 pares de handoffs simultáneos): sin bloqueo → ${sinLock} pares con el mismo asesor; con FOR NO KEY UPDATE → ${conLock}`);
  assert.equal(conLock, 0, "con bloqueo, dos handoffs simultáneos nunca eligen al mismo asesor");

  // ---------- 9B. Round-robin: el Cajero nunca recibe un handoff ----------
  const org4 = orgId + 4n;
  const o4 = org4.toString();
  await q("INSERT INTO orgs (id, nombre, slug) VALUES ($1,'Bot API RR',$2)", [o4, `bot-api-rr-${sufijo}`]);
  const usuarioRR = (n: string, puesto: string, rol = "agente", activo = true) =>
    uno(
      `INSERT INTO usuarios (org_id, nombre, email, password_hash, puesto, rol, activo) VALUES ($1,$2,$3,'x',$4,$5,$6) RETURNING id::text AS id`,
      [o4, n, `${n}-${sufijo}@rr.test`, puesto, rol, activo],
    );
  const cajero = await usuarioRR("cajero", "Cajero");
  const asesor1 = await usuarioRR("asesor1", "Agente");
  const asesor2 = await usuarioRR("asesor2", "Agente");
  await usuarioRR("cajero-inactivo", "Agente", "agente", false);
  const botRR = await uno(
    `INSERT INTO bots (org_id, nombre, webhook_url, api_token, permisos) VALUES ($1,'rr','https://8.8.8.8/h',$2,${TODOS_SQL}) RETURNING id::text AS id`,
    [o4, token("rr")],
  );
  const convRR = async (n: number) => {
    const c = await uno(`INSERT INTO contactos (org_id, nombre, telefono) VALUES ($1,$2,$3) RETURNING id::text AS id`, [o4, `RR${n}`, `55${Date.now()}${n}`]);
    return uno(`INSERT INTO conversaciones (org_id, contacto_id) VALUES ($1,$2) RETURNING id::text AS id`, [o4, c]);
  };
  const botRRObj = { id: BigInt(botRR), orgId: org4, asesorId: null };
  const asignados: string[] = [];
  for (let i = 0; i < 4; i++) {
    const r = await escalarAHumano(botRRObj, BigInt(await convRR(i)), "prueba");
    asignados.push(String(r?.responsableId));
  }
  console.log(`round-robin con 1 Cajero y 2 asesores → ${asignados.map((a) => (a === asesor1 ? "asesor1" : a === asesor2 ? "asesor2" : a === cajero ? "CAJERO" : a)).join(", ")}`);
  assert.ok(!asignados.includes(cajero), "el Cajero nunca recibe un handoff");
  assert.deepEqual(asignados, [asesor1, asesor2, asesor1, asesor2], "se reparten por turnos solo entre los asesores");
  // El asesor fijo del bot se respeta igual que antes.
  const botFijo = { id: BigInt(botRR), orgId: org4, asesorId: BigInt(asesor2) };
  const rFijo = await escalarAHumano(botFijo, BigInt(await convRR(10)), "prueba");
  assert.equal(String(rFijo?.responsableId), asesor2, "el asesor fijo del bot se respeta");
  // Solo queda un Cajero activo: sin asesores elegibles no se asigna a nadie.
  await q("UPDATE usuarios SET activo=false WHERE org_id=$1 AND id IN ($2,$3)", [o4, asesor1, asesor2]);
  const rNadie = await escalarAHumano(botRRObj, BigInt(await convRR(11)), "prueba");
  assert.equal(rNadie?.responsableId, null, "solo Cajeros activos: queda sin asesor, no se le asigna al Cajero");

  await bloque3(o, { canalA, canalB, token, conv, contactoId, botA });
  await bloque4(token, conv, botA);
  await bloque5(o, { canalA, canalB, token, conv, contactoId, botA });
  await probarParidadBot(orgId + 5n);
  console.log("OK · API del bot");
}

/** Ruta que "olvida" conBot: autentica pero consulta sin tenant. Debe fallar cerrado, nunca filtrar. */
const olvidadiza: Handler = async (req) => {
  const bot = await requireBot(req);
  if (!bot) return NextResponse.json({ error: "token inválido" }, { status: 401 });
  const id = BigInt(new URL(req.url).searchParams.get("c") ?? "0");
  const visible = (await db.conversacion.findUnique({ where: { id } })) !== null;
  let insertado = true;
  try {
    await db.mensaje.create({ data: { conversacionId: id, direccion: "saliente", contenido: "fuga" } });
  } catch {
    insertado = false;
  }
  return NextResponse.json({ visible, insertado });
};

async function bloque4(token: (n: string) => string, conv: string, botA: string) {
  const o = orgId.toString();

  // ---------- 1. Una ruta que olvida conBot no ve ni escribe datos ----------
  const olvidada = await llamar(olvidadiza, token("A"), conv, undefined, { query: `?c=${conv}` });
  assert.deepEqual(await olvidada.json(), { visible: false, insertado: false }, "sin conBot no hay tenant: falla cerrado");

  // ---------- 2. 50 + 50 peticiones simultáneas de dos empresas ----------
  const empresas = [orgId + 2n, orgId + 3n];
  const datos: { marca: string; org: string; token: string; conv: string }[] = [];
  for (const [i, org] of empresas.entries()) {
    const marca = i === 0 ? "P" : "Q";
    await q("INSERT INTO orgs (id, nombre, slug) VALUES ($1,$2,$3)", [org.toString(), `Concurrente ${marca}`, `conc-${marca}-${sufijo}`.toLowerCase()]);
    await q(`INSERT INTO modulos_org (org_id, clave, activo) VALUES ($1,'citas',true)`, [org.toString()]);
    await q(`INSERT INTO bots (org_id, nombre, webhook_url, api_token, permisos) VALUES ($1,$2,'https://8.8.8.8/h',$3,${TODOS_SQL})`, [org.toString(), `bot-${marca}`, `t-conc-${marca}-${sufijo}`]);
    const contacto = await uno(`INSERT INTO contactos (org_id, nombre, telefono) VALUES ($1,$2,$3) RETURNING id::text AS id`, [org.toString(), `Contacto-${marca}`, `54${Date.now()}${i}`]);
    const c = await uno(`INSERT INTO conversaciones (org_id, contacto_id) VALUES ($1,$2) RETURNING id::text AS id`, [org.toString(), contacto]);
    for (let m = 1; m <= 3; m++) {
      await q(`INSERT INTO mensajes (org_id, conversacion_id, direccion, contenido) VALUES ($1,$2,'entrante',$3)`, [org.toString(), c, `msg-${marca}-${m}`]);
    }
    datos.push({ marca, org: org.toString(), token: `t-conc-${marca}-${sufijo}`, conv: c });
  }
  const [P, Q] = datos;
  const N = 50;
  const peticiones: Promise<{ tipo: string; marca: string; status: number; cuerpo: any }>[] = [];
  const lanzar = (tipo: string, d: typeof P, conversacion: string, handler: Handler, cuerpo?: unknown) =>
    llamar(handler, d.token, conversacion, cuerpo).then(async (r) => ({ tipo, marca: d.marca, status: r.status, cuerpo: await r.json() }));
  for (let i = 0; i < N; i++) {
    for (const [propia, ajena] of [[P, Q], [Q, P]]) {
      peticiones.push(lanzar("get", propia, propia.conv, getConversacion));
      peticiones.push(lanzar("post", propia, propia.conv, postMessages, { content: `nota-${propia.marca}-${i}`, private: true }));
      if (i % 2 === 0) peticiones.push(lanzar("cruzada", propia, ajena.conv, getConversacion));
    }
  }
  const respuestas = await Promise.all(peticiones);
  assert.equal(respuestas.length, 4 * N + 2 * (N / 2));
  for (const r of respuestas) {
    if (r.tipo === "get") {
      assert.equal(r.status, 200);
      assert.equal(r.cuerpo.meta.sender.name, `Contacto-${r.marca}`, "GET trae datos de otra empresa");
      assert.ok(r.cuerpo.mensajes.every((m: { content: string }) => m.content.startsWith(`msg-${r.marca}-`)), "mensajes de otra empresa");
    } else if (r.tipo === "post") {
      assert.equal(r.status, 200);
      assert.equal(r.cuerpo.content.startsWith(`nota-${r.marca}-`), true);
    } else {
      assert.equal(r.status, 404, "la conversación de la otra empresa no debe existir para este bot");
    }
  }
  for (const d of datos) {
    const propios = await q<{ n: number }>(`SELECT count(*)::int n FROM mensajes WHERE org_id=$1 AND contenido LIKE $2`, [d.org, `nota-${d.marca}-%`]);
    const ajenos = await q<{ n: number }>(`SELECT count(*)::int n FROM mensajes WHERE org_id=$1 AND contenido LIKE 'nota-%' AND contenido NOT LIKE $2`, [d.org, `nota-${d.marca}-%`]);
    assert.equal(propios[0].n, N, `empresa ${d.marca}: ${N} notas propias`);
    assert.equal(ajenos[0].n, 0, `empresa ${d.marca}: ninguna nota de la otra`);
  }
  console.log(`simultáneas: ${respuestas.length} peticiones (2 empresas × ${N} GET + ${N} POST + ${N / 2} cruzadas) → 0 fugas`);
  // Tras el tráfico, el contexto del servidor sigue limpio.
  const despues = await llamar(olvidadiza, token("A"), conv, undefined, { query: `?c=${conv}` });
  assert.deepEqual(await despues.json(), { visible: false, insertado: false });

  // ---------- 3. Tokens inválidos por IP: 429 con Retry-After; el token válido no se bloquea ----------
  process.env.BOT_AUTH_FAIL_MAX = "3";
  try {
    const ip = { "x-real-ip": `203.0.113.${(Date.now() % 200) + 1}` };
    const malos: number[] = [];
    let retryAfter: string | null = null;
    for (let i = 0; i < 5; i++) {
      const r = await llamar(getConversacion, `malo-${i}-${sufijo}`, conv, undefined, { headers: ip });
      malos.push(r.status);
    }
    const bloqueada = await llamar(getConversacion, "malo-final", conv, undefined, { headers: ip });
    retryAfter = bloqueada.headers.get("retry-after");
    assert.equal(bloqueada.status, 429);
    assert.deepEqual(malos, [401, 401, 401, 429, 429]);
    assert.equal(retryAfter, "300");
    assert.equal((await llamar(getConversacion, token("A"), conv, undefined, { headers: ip })).status, 200, "token válido desde la IP bloqueada");
    assert.equal((await llamar(getConversacion, "otro-malo", conv, undefined, { headers: { "x-real-ip": "198.51.100.77" } })).status, 401, "otra IP no se ve afectada");
  } finally {
    delete process.env.BOT_AUTH_FAIL_MAX;
  }

  // ---------- 4. Bitácora de solo agregar ----------
  await runWithOrg(orgId, () => auditarBot({ id: BigInt(botA) }, BigInt(conv), "prueba_append", { entidad: "x" }));
  await assert.rejects(() => dbRaw.$executeRawUnsafe(`UPDATE auditoria_bot SET accion='x'`), /permission denied|denegado/i, "crm_app no puede UPDATE");
  await assert.rejects(() => dbRaw.$executeRawUnsafe(`DELETE FROM auditoria_bot`), /permission denied|denegado/i, "crm_app no puede DELETE");
  // Borrar un bot con filas de bitácora funciona (FK ON DELETE SET NULL corre como dueño) y la fila se conserva.
  const efimero = await uno(
    `INSERT INTO bots (org_id, nombre, webhook_url, api_token, permisos) VALUES ($1,'efimero','https://8.8.8.8/h',$2,${TODOS_SQL}) RETURNING id::text AS id`,
    [o, `t-ef-${sufijo}`],
  );
  await runWithOrg(orgId, () => auditarBot({ id: BigInt(efimero) }, BigInt(conv), "prueba_fk", {}));
  await runWithOrg(orgId, () => db.bot.delete({ where: { id: BigInt(efimero) } }));
  const huerfana = await q<{ bot_id: string | null }>(`SELECT bot_id::text FROM auditoria_bot WHERE org_id=$1 AND accion='prueba_fk'`, [o]);
  assert.equal(huerfana.length, 1);
  assert.equal(huerfana[0].bot_id, null);
}

type Ctx = { canalA: string; canalB: string; token: (n: string) => string; conv: string; contactoId: string; botA: string };

async function bloque3(o: string, ctx: Ctx) {
  const { canalA, canalB, token } = ctx;
  process.env.NEXTAUTH_URL = "https://crm.prueba.test";
  let telefonos = 0;
  const nuevaConversacion = async (canal = canalA, org = o) => {
    const c = await uno(
      `INSERT INTO contactos (org_id, nombre, telefono) VALUES ($1,$2,$3) RETURNING id::text AS id`,
      [org, `B3-${telefonos}`, `53${Date.now()}${telefonos++}`],
    );
    return {
      contacto: c,
      id: await uno(`INSERT INTO conversaciones (org_id, contacto_id, canal_id) VALUES ($1,$2,$3) RETURNING id::text AS id`, [org, c, canal]),
    };
  };
  const auditoria = (accion: string) =>
    q<{ despues: Record<string, unknown> | null }>("SELECT despues FROM auditoria_bot WHERE org_id=$1 AND accion=$2 ORDER BY id", [o, accion]);
  const modulo = (clave: string, activo: boolean, config: unknown = {}) =>
    q(
      `INSERT INTO modulos_org (org_id, clave, activo, config) VALUES ($1,$2,$3,$4)
       ON CONFLICT (org_id, clave) DO UPDATE SET activo = EXCLUDED.activo, config = EXCLUDED.config`,
      [o, clave, activo, JSON.stringify(config)],
    );

  // Otra empresa con su propio bot, para el aislamiento entre empresas.
  const org2 = orgId + 1n;
  await q("INSERT INTO orgs (id, nombre, slug) VALUES ($1,'Bot API 2',$2)", [org2.toString(), `bot-api2-${sufijo}`]);
  const canal2 = await uno(`INSERT INTO canales_whatsapp (org_id, nombre) VALUES ($1,'C2') RETURNING id::text AS id`, [org2.toString()]);
  await q(`INSERT INTO bots (org_id, nombre, webhook_url, api_token, canal_id, permisos) VALUES ($1,'bot2','https://8.8.8.8/h',$2,$3,${TODOS_SQL})`, [org2.toString(), token("org2"), canal2]);
  await modulo("citas", true);
  await modulo("cotizaciones", true);
  await q(`INSERT INTO modulos_org (org_id, clave, activo) VALUES ($1,'citas',true),($1,'cotizaciones',true)`, [org2.toString()]);

  // Lectura de conversaciones: RLS, paginación, histórico y filtros combinados.
  const conv = ctx.conv;
  const contactoOrg2 = await uno(`INSERT INTO contactos (org_id, nombre, telefono) VALUES ($1,'AjenO',$2) RETURNING id::text AS id`, [org2.toString(), `52${Date.now()}99`]);
  const convOrg2 = await uno(`INSERT INTO conversaciones (org_id, contacto_id, canal_id) VALUES ($1,$2,$3) RETURNING id::text AS id`, [org2.toString(), contactoOrg2, canal2]);
  const mensajeOrg2 = await uno(`INSERT INTO mensajes (org_id, conversacion_id, direccion, contenido) VALUES ($1,$2,'entrante','privado de B') RETURNING id::text AS id`, [org2.toString(), convOrg2]);
  const corte = new Date(Date.now() + 60_000);
  const nuevas = [(await nuevaConversacion()).id, (await nuevaConversacion()).id, (await nuevaConversacion()).id];
  for (const [i, id] of [conv, ...nuevas].entries()) {
    await q("UPDATE conversaciones SET updated_at=$2 WHERE id=$1", [id, new Date(corte.getTime() + (i + 1) * 1000)]);
  }
  const query = `?updated_after=${encodeURIComponent(corte.toISOString())}&per_page=2`;
  const leerLista = (tk: string, extra = "") => llamar(getConversaciones, token(tk), "0", undefined, { query: `${query}${extra}` });
  const paginas = [];
  for (let page = 1; page <= 2; page++) {
    const res = await leerLista("A", `&page=${page}`);
    assert.equal(res.status, 200);
    paginas.push(...(await res.json()).payload.map((c: { id: number }) => c.id));
  }
  assert.deepEqual(paginas, [conv, ...nuevas].map(Number), "todas las páginas en updated_at ASC, id ASC, sin duplicados");
  const filtradas = await leerLista("A", "&labels%5B%5D=interesado");
  assert.deepEqual((await filtradas.json()).payload.map((c: { id: number }) => c.id), [Number(conv)], "updated_after y labels[] combinados");
  const ultimaNota = await uno(`INSERT INTO mensajes (org_id, conversacion_id, direccion, contenido, interna, created_at, "timestamp")
    VALUES ($1,$2,'saliente','nota privada de prueba',true,now() + interval '1 day',now() + interval '1 day') RETURNING id::text AS id`, [o, conv]);
  const conMensajes = await leerLista("A", "&labels%5B%5D=interesado&include=messages");
  const [conHistorico] = (await conMensajes.json()).payload;
  const cuenta = (await q<{ n: number }>("SELECT count(*)::int AS n FROM mensajes WHERE conversacion_id=$1 AND NOT interna", [conv]))[0].n;
  assert.equal(conHistorico.messages.length, cuenta, "include=messages solo devuelve mensajes públicos");
  assert.equal(conHistorico.messages_truncated, false);
  assert.ok(conHistorico.messages.every((m: { private: boolean }) => !m.private));
  assert.ok(conHistorico.messages.every((m: { created_at: number }, i: number, a: { created_at: number }[]) => i === 0 || a[i - 1].created_at <= m.created_at));
  const primera = await llamar(getMensajes, token("A"), conv, undefined, { query: "?limit=5" });
  assert.equal(primera.status, 200);
  const primeros = await primera.json();
  assert.equal(primeros.length, 5);
  assert.equal(primera.headers.get("X-Next-After"), String(primeros.at(-1).id));
  const segunda = await llamar(getMensajes, token("A"), conv, undefined, { query: `?after=${primera.headers.get("X-Next-After")}&limit=5` });
  const siguientes = await segunda.json();
  assert.equal(siguientes.length, 5);
  const anteriores = await llamar(getMensajes, token("A"), conv, undefined, { query: `?before=${siguientes[0].id}&limit=5` });
  const previos = await anteriores.json();
  assert.deepEqual(previos, primeros, "before retrocede y conserva el orden ascendente");
  assert.equal((await llamar(getMensajes, token("A"), conv, undefined, { query: `?after=${primeros[0].id}&before=${siguientes[0].id}` })).status, 400);
  assert.equal((await llamar(getMensajes, token("A"), conv, undefined, { query: `?after=${mensajeOrg2}` })).status, 400);
  assert.equal((await llamar(getMensajes, token("A"), conv, undefined, { query: "?limit=501" })).status, 400);
  const historial = await (await llamar(getMensajes, token("A"), conv)).json();
  assert.deepEqual(historial, conHistorico.messages, "GET messages completo coincide con include=messages");
  const retroceso = await llamar(getMensajes, token("A"), conv, undefined, { query: `?before=${historial.at(-1).id}&limit=5` });
  const retroPagina = await retroceso.json();
  assert.equal(retroPagina.length, 5);
  assert.equal(retroceso.headers.get("X-Next-Before"), String(retroPagina[0].id));
  assert.ok(historial.every((m: { private: boolean }) => !m.private), "las notas internas no salen por defecto");
  const privados = await (await llamar(getMensajes, token("A"), conv, undefined, { query: "?include_private=true" })).json();
  assert.ok(privados.some((m: { private: boolean }) => m.private), "el permiso notas_internas permite incluir notas");
  await q(`INSERT INTO bots (org_id, nombre, webhook_url, api_token, canal_id, permisos) VALUES ($1,'solo lectura','https://8.8.8.8/h',$2,$3,ARRAY['leer_perfil'])`, [o, token("sololectura"), canalA]);
  assert.equal((await llamar(getMensajes, token("sololectura"), conv, undefined, { query: "?include_private=true" })).status, 403);
  assert.equal((await leerLista("sololectura", "&include=messages&include_private=true")).status, 403);
  const notaIds = (await q<{ id: string }>("SELECT id::text FROM mensajes WHERE conversacion_id=$1 AND interna", [conv])).map((r) => Number(r.id));
  assert.ok(!notaIds.includes(conHistorico.last_message?.id), "last_message no revela una nota interna");
  assert.notEqual(conHistorico.last_message?.id, Number(ultimaNota));
  const listaPrivada = await leerLista("A", "&labels%5B%5D=interesado&include=messages&include_private=true");
  assert.ok((await listaPrivada.json()).payload[0].messages.some((m: { id: number }) => m.id === Number(ultimaNota)));
  await q("UPDATE conversaciones SET bot_activo=true WHERE id=$1", [conv]);
  const detalleActivo = await (await llamar(getConversacion, token("A"), conv)).json();
  assert.deepEqual(detalleActivo.labels, []);
  assert.ok(!notaIds.includes(detalleActivo.last_message?.id));
  await q("UPDATE conversaciones SET bot_activo=false WHERE id=$1", [conv]);
  assert.deepEqual((await (await llamar(getConversacion, token("A"), conv)).json()).labels, ["bot_off"]);
  await q("UPDATE conversaciones SET bot_activo=true WHERE id=$1", [conv]);
  assert.equal((await llamar(getMensajes, token("B"), conv)).status, 404, "otro canal no puede leer mensajes");
  assert.equal((await llamar(getConversacion, token("B"), conv)).status, 403, "detalle conserva su rechazo de otro canal");
  assert.equal((await llamar(getConversaciones, token("B"), "0")).status, 200);
  assert.ok(!(await (await llamar(getConversaciones, token("B"), "0")).json()).payload.some((c: { id: number }) => c.id === Number(conv)));
  assert.equal((await llamar(getMensajes, token("org2"), conv)).status, 404, "otra org no puede leer mensajes");
  assert.equal((await llamar(getConversacion, token("org2"), conv)).status, 404, "otra org no puede leer conversación");
  const listaOrg2 = await llamar(getConversaciones, token("org2"), "0");
  assert.deepEqual((await listaOrg2.json()).payload.map((c: { id: number }) => c.id), [Number(convOrg2)], "org B solo ve sus conversaciones");

  const convGrande = (await nuevaConversacion()).id;
  await q(`INSERT INTO mensajes (org_id, conversacion_id, direccion, contenido)
    SELECT $1, $2, 'entrante', 'historico ' || n FROM generate_series(1, 501) AS n`, [o, convGrande]);
  await q("UPDATE conversaciones SET updated_at=$2 WHERE id=$1", [convGrande, new Date(corte.getTime() + 10_000)]);
  const lote = await leerLista("A", "&page=3&include=messages");
  const recortada = (await lote.json()).payload.find((c: { id: number }) => c.id === Number(convGrande));
  assert.equal(recortada.messages.length, 500);
  assert.equal(recortada.messages_truncated, true);

  // ---------- Citas: datos ----------
  await modulo("reservas_en_linea", true, { zona: "America/Mexico_City", anticipacionMin: 0, granularidadMin: 30, ventanaDias: 30 });
  const zona = "America/Mexico_City";
  const hoy = fechaLocal(new Date(), zona);
  const dia = sumarDias(hoy, 3);
  const doctor = async (n: string) => uno(`INSERT INTO doctores (org_id, nombre) VALUES ($1,$2) RETURNING id::text AS id`, [o, `${n}-${sufijo}`]);
  const [d1, d2] = [await doctor("Dra. A"), await doctor("Dr. B")];
  const servicio = await uno(
    `INSERT INTO servicios_reserva (org_id, nombre, duracion_min, buffer_min) VALUES ($1,'Consulta',30,0) RETURNING id::text AS id`,
    [o],
  );
  for (const d of [d1, d2]) {
    await q(`INSERT INTO servicio_reserva_doctores (org_id, servicio_id, doctor_id) VALUES ($1,$2,$3)`, [o, servicio, d]);
    for (let dow = 0; dow < 7; dow++) {
      await q(`INSERT INTO horarios_doctor (org_id, doctor_id, dia_semana, inicio_min, fin_min) VALUES ($1,$2,$3,540,720)`, [o, d, dow]);
    }
  }
  const X = await nuevaConversacion();
  const Y = await nuevaConversacion();
  const Z = await nuevaConversacion();
  const lista = (r: Response) => r.json() as Promise<{ horarios: { hora: string; inicio: string }[]; servicio?: { id: string }; error?: string; servicios?: unknown[] }>;

  // ---------- 3A.1 Disponibilidad ----------
  const disp = await llamar(getDisponibilidad, token("A"), X.id, undefined, { query: `?fecha=${dia}` });
  assert.equal(disp.status, 200);
  const dj = await lista(disp);
  assert.deepEqual(dj.horarios.map((h) => h.hora), ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"], "un solo servicio activo se usa solo");
  assert.equal((await llamar(getDisponibilidad, token("A"), X.id, undefined, { query: `?fecha=${dia}&profesionalId=${d1}&servicioId=${servicio}` })).status, 200);
  assert.equal((await llamar(getDisponibilidad, token("A"), X.id, undefined, { query: "?fecha=2020-01-01" })).status, 400, "fecha pasada");
  assert.equal((await llamar(getDisponibilidad, token("A"), X.id, undefined, { query: "" })).status, 400, "fecha requerida");
  assert.equal((await llamar(getDisponibilidad, token("A"), X.id, undefined, { query: `?fecha=${dia}&profesionalId=999999999` })).status, 400);
  assert.equal((await llamar(getDisponibilidad, token("B"), X.id, undefined, { query: `?fecha=${dia}` })).status, 403, "otro canal");
  assert.equal((await llamar(getDisponibilidad, token("org2"), X.id, undefined, { query: `?fecha=${dia}` })).status, 404, "otra empresa");
  assert.equal((await llamar(getDisponibilidad, null, X.id, undefined, { query: `?fecha=${dia}` })).status, 401);

  // ---------- 3A.2 Agendar ----------
  const cuerpo = (extra: Record<string, unknown> = {}) => ({ fecha: dia, hora: "09:00", servicioId: servicio, profesionalId: d1, ...extra });
  const r1 = await llamar(postCitas, token("A"), X.id, cuerpo());
  assert.equal(r1.status, 201);
  const cita1 = (await r1.json()).cita;
  assert.equal(cita1.estado, "programada");
  assert.equal(cita1.doctorId, d1);
  assert.match(cita1.enlaceGestion, /^https:\/\/crm\.prueba\.test\/reservar\/cita\/[0-9a-f]{32}$/);
  const rep = await llamar(postCitas, token("A"), X.id, cuerpo());
  assert.equal(rep.status, 200, "reintento idempotente");
  assert.equal((await rep.json()).repetida, true);
  const notasAgenda = await textosNotasBot(X.id);
  assert.equal(notasAgenda.length, 1, "el reintento idempotente no duplica la nota");
  assert.match(notasAgenda[0], new RegExp(`^🤖 Agendó cita: [a-zñáéíóú]+ \\d{1,2}, 09:00 con Dra\\. A-${sufijo}$`));
  assert.equal((await llamar(postCitas, token("A"), Y.id, cuerpo())).status, 409, "mismo profesional y hora ocupados");
  const sinPref = await llamar(postCitas, token("A"), Y.id, cuerpo({ profesionalId: undefined }));
  assert.equal(sinPref.status, 201, "sin preferencia toma al otro profesional");
  assert.equal((await sinPref.json()).cita.doctorId, d2);
  assert.equal((await llamar(postCitas, token("A"), Z.id, cuerpo({ profesionalId: undefined }))).status, 409, "ambos ocupados");
  assert.equal((await llamar(postCitas, token("A"), Z.id, cuerpo({ hora: "09:15", profesionalId: d1 }))).status, 409, "hora fuera de la rejilla");
  assert.equal((await llamar(postCitas, token("A"), Z.id, cuerpo({ hora: "25:00" }))).status, 400);
  assert.equal((await llamar(postCitas, token("A"), Z.id, cuerpo({ servicioId: undefined }))).status, 400);
  assert.equal((await llamar(postCitas, token("B"), Z.id, cuerpo({ hora: "10:00" }))).status, 403, "otro canal");
  assert.equal((await llamar(postCitas, token("org2"), Z.id, cuerpo({ hora: "10:00" }))).status, 404, "otra empresa");
  const libres = await lista(await llamar(getDisponibilidad, token("A"), Z.id, undefined, { query: `?fecha=${dia}&profesionalId=${d1}` }));
  assert.ok(!libres.horarios.some((h) => h.hora === "09:00"), "el horario agendado ya no se ofrece");
  assert.equal((await q("SELECT origen, conversacion_id::text c FROM citas WHERE id=$1", [cita1.id]))[0].origen, "bot");
  assert.equal((await auditoria("cita_agendada")).length, 2);

  // ---------- 3A.2 Concurrencia (ruta): dos peticiones al mismo horario, una gana ----------
  const horasCarrera = ["10:00", "10:30", "11:00", "11:30"];
  for (const hora of horasCarrera) {
    const [a, b] = [await nuevaConversacion(), await nuevaConversacion()];
    const estados = (
      await Promise.all([a, b].map((c) => llamar(postCitas, token("A"), c.id, cuerpo({ hora, profesionalId: d1 }))))
    ).map((r) => r.status).sort();
    assert.deepEqual(estados, [201, 409], `carrera a las ${hora}: ${estados}`);
  }
  assert.equal(
    (await q("SELECT count(*)::int n FROM (SELECT 1 FROM citas WHERE org_id=$1 AND estado <> 'cancelada' GROUP BY doctor_id, inicio HAVING count(*) > 1) t", [o]))[0].n,
    0,
    "ninguna cita duplicada para el mismo profesional",
  );

  // ---------- Concurrencia (función): sin bloqueo vs con bloqueo ----------
  const serv = (await q<Record<string, unknown>>("SELECT * FROM servicios_reserva WHERE id=$1", [servicio]))[0];
  const servicioPrisma = {
    id: BigInt(servicio), orgId, nombre: String(serv.nombre), descripcion: null, duracionMin: 30, bufferMin: 0,
    precio: null as never, activo: true, createdAt: new Date(), updatedAt: new Date(),
  };
  async function carreras(bloquear: boolean, pares: number) {
    let dobles = 0;
    for (let i = 0; i < pares; i++) {
      const inicio = new Date(Date.UTC(2031, bloquear ? 0 : 6, 1 + i, 16, 0));
      const [a, b] = [await nuevaConversacion(), await nuevaConversacion()];
      const intento = (c: { contacto: string; id: string }) =>
        reservarCita(orgId, { servicio: servicioPrisma, candidatos: [BigInt(d2)], inicio, contactoId: BigInt(c.contacto), notas: null, origen: "bot", bloquear });
      const [ra, rb] = await Promise.all([intento(a), intento(b)]);
      if (ra && rb) dobles++;
    }
    return dobles;
  }
  const sinLock = await carreras(false, 15);
  const conLock = await carreras(true, 15);
  console.log(`citas (15 pares de reservas simultáneas al mismo horario): sin bloqueo → ${sinLock} pares con doble reserva; con FOR UPDATE → ${conLock}`);
  assert.equal(conLock, 0, "con bloqueo nunca hay doble reserva");

  // ---------- 3A.3 Reprogramar, confirmar y cancelar ----------
  const rp = await llamar(patchCitas, token("A"), X.id, { citaId: cita1.id, fecha: dia, hora: "11:00" }, { metodo: "PATCH" });
  assert.equal(rp.status, 409, "11:00 de d1 fue ocupado en la carrera");
  const libresD1 = await lista(await llamar(getDisponibilidad, token("A"), X.id, undefined, { query: `?fecha=${dia}&profesionalId=${d1}` }));
  assert.deepEqual(libresD1.horarios.map((h) => h.hora), ["09:30"], "solo queda 09:30 libre para d1");
  const mueve = await llamar(patchCitas, token("A"), X.id, { citaId: cita1.id, fecha: dia, hora: "09:30" }, { metodo: "PATCH" });
  assert.equal(mueve.status, 200);
  assert.match((await textosNotasBot(X.id)).at(-1) ?? "", /^🤖 Reprogramó cita: [a-zñáéíóú]+ \d{1,2}, 09:30$/);
  const movida = (await mueve.json()).cita;
  assert.equal(new Date(movida.inicio).getTime() - new Date(cita1.inicio).getTime(), 30 * 60_000);
  assert.equal(
    (await q("SELECT (fin - inicio) = interval '30 minutes' AS ok FROM citas WHERE id=$1", [cita1.id]))[0].ok,
    true,
    "conserva la duración",
  );
  // Reprogramar sobre su propio horario no se bloquea a sí misma.
  assert.equal((await llamar(patchCitas, token("A"), X.id, { citaId: cita1.id, fecha: dia, hora: "09:30" }, { metodo: "PATCH" })).status, 200);
  assert.equal((await llamar(patchCitas, token("A"), Y.id, { citaId: cita1.id, fecha: dia, hora: "09:00" }, { metodo: "PATCH" })).status, 404, "la cita es de otro contacto");
  assert.equal((await llamar(patchCitas, token("B"), X.id, { citaId: cita1.id, fecha: dia, hora: "09:00" }, { metodo: "PATCH" })).status, 403);
  assert.equal((await llamar(patchCitas, token("A"), X.id, { citaId: cita1.id, fecha: dia }, { metodo: "PATCH" })).status, 400, "falta hora");
  assert.equal((await llamar(patchCitas, token("A"), X.id, { citaId: cita1.id, fecha: dia, hora: "09:00", estado: "cancelada" }, { metodo: "PATCH" })).status, 400);
  assert.equal((await auditoria("cita_reprogramada")).length, 2);
  // Carrera de reprogramación: dos citas intentan el mismo hueco; gana una.
  const m = await nuevaConversacion();
  const cm = (await (await llamar(postCitas, token("A"), m.id, cuerpo({ hora: "09:00", profesionalId: d1 }))).json()).cita;
  // La otra cita del mismo profesional: la de las 10:00 (ganó la carrera de arriba).
  const cn = (await q<{ id: string; conversacion_id: string }>(
    "SELECT id::text, conversacion_id::text FROM citas WHERE org_id=$1 AND doctor_id=$2 AND estado='programada' AND inicio=$3::timestamp",
    [o, d1, instanteLocal(dia, 600, zona).toISOString()],
  ))[0];
  assert.ok(cm.id && cn.id);
  await q("UPDATE citas SET estado='cancelada' WHERE id=$1", [cita1.id]);
  const dispuesto = await lista(await llamar(getDisponibilidad, token("A"), m.id, undefined, { query: `?fecha=${dia}&profesionalId=${d1}` }));
  assert.ok(dispuesto.horarios.some((h) => h.hora === "09:30"));
  const huecoLibre = (
    await Promise.all(
      [{ conv: m.id, id: cm.id }, { conv: cn.conversacion_id, id: cn.id }].map(({ conv, id }) =>
        llamar(patchCitas, token("A"), conv, { citaId: id, fecha: dia, hora: "09:30" }, { metodo: "PATCH" }),
      ),
    )
  ).map((r) => r.status);
  assert.equal(huecoLibre.filter((e) => e === 200).length, 1, `solo una gana el hueco: ${huecoLibre}`);

  // Función: reprogramación concurrente sin y con bloqueo
  async function carrerasReprog(bloquear: boolean, pares: number) {
    let dobles = 0;
    for (let i = 0; i < pares; i++) {
      const base = Date.UTC(2032, bloquear ? 0 : 6, 1 + i, 16, 0);
      const crear = async (min: number) => {
        const c = await nuevaConversacion();
        return uno(
          `INSERT INTO citas (org_id, contacto_id, doctor_id, titulo, inicio, fin) VALUES ($1,$2,$3,'r',$4::timestamp,$5::timestamp) RETURNING id::text AS id`,
          [o, c.contacto, d2, new Date(base + min * 60_000).toISOString(), new Date(base + (min + 30) * 60_000).toISOString()],
        );
      };
      const [a, b] = [await crear(0), await crear(60)];
      const destino = new Date(base + 120 * 60_000);
      const mover = (id: string, min: number) =>
        reprogramarCita(orgId, { id: BigInt(id), doctorId: BigInt(d2), inicio: new Date(base + min * 60_000), fin: new Date(base + (min + 30) * 60_000) }, destino, bloquear);
      const [ra, rb] = await Promise.all([mover(a, 0), mover(b, 60)]);
      if (ra && rb) dobles++;
    }
    return dobles;
  }
  const rSin = await carrerasReprog(false, 15);
  const rCon = await carrerasReprog(true, 15);
  console.log(`reprogramación (15 pares al mismo hueco): sin bloqueo → ${rSin} dobles; con FOR UPDATE → ${rCon}`);
  assert.equal(rCon, 0);

  // Confirmar y cancelar siguen igual (mismos campos de respuesta)
  const conf = await llamar(patchCitas, token("A"), m.id, { citaId: cm.id, estado: "confirmada" }, { metodo: "PATCH" });
  assert.equal(conf.status, 200);
  assert.equal((await conf.json()).cita.estado, "confirmada");
  const canc = await llamar(patchCitas, token("A"), m.id, { citaId: cm.id, estado: "cancelada" }, { metodo: "PATCH" });
  assert.equal((await canc.json()).cita.estado, "cancelada");
  const notasEstado = await textosNotasBot(m.id);
  assert.ok(notasEstado.some((t) => /^🤖 Confirmó cita: /.test(t)), "nota al confirmar");
  assert.ok(notasEstado.some((t) => /^🤖 Canceló cita: /.test(t)), "nota al cancelar");
  assert.equal((await auditoria("cita_confirmada")).length >= 1, true);
  assert.equal((await llamar(patchCitas, token("A"), m.id, { citaId: cm.id, estado: "x" }, { metodo: "PATCH" })).status, 400);

  // ---------- 3A.4 Módulo de citas apagado (sin sesión de usuario) ----------
  await modulo("citas", false);
  for (const [nombre, respuesta] of [
    ["GET citas", await llamar(getCitas, token("A"), X.id)],
    ["POST citas", await llamar(postCitas, token("A"), X.id, cuerpo({ hora: "11:30" }))],
    ["PATCH citas", await llamar(patchCitas, token("A"), X.id, { citaId: cita1.id, estado: "confirmada" }, { metodo: "PATCH" })],
    ["PATCH reprogramar", await llamar(patchCitas, token("A"), X.id, { citaId: cita1.id, fecha: dia, hora: "09:30" }, { metodo: "PATCH" })],
    ["GET disponibilidad", await llamar(getDisponibilidad, token("A"), X.id, undefined, { query: `?fecha=${dia}` })],
  ] as const) {
    assert.equal(respuesta.status, 404, `${nombre} con módulo apagado`);
  }
  await modulo("citas", true);
  assert.equal((await llamar(getCitas, token("A"), X.id)).status, 200);

  // ---------- 3B Cotizaciones ----------
  const Q = await nuevaConversacion();
  const producto = await uno(
    `INSERT INTO productos (org_id, nombre, precio, activo) VALUES ($1,$2,100,true) RETURNING id::text AS id`,
    [o, `Producto-${sufijo}`],
  );
  await q("INSERT INTO embudos (org_id, nombre) SELECT $1, 'E2' WHERE NOT EXISTS (SELECT 1 FROM embudos WHERE org_id=$1)", [o]);
  const crear = (extra: Record<string, unknown> = {}, tk = "A", conv = Q.id) =>
    llamar(postCotizaciones, token(tk), conv, {
      partidas: [
        { productoId: producto, cantidad: 2 },
      ],
      ...extra,
    });
  const c1r = await crear({ contactoId: "999999", convertirVenta: true });
  assert.equal(c1r.status, 201);
  const c1 = await c1r.json();
  assert.equal(c1.subtotal, 200);
  assert.equal(c1.descuento, 0);
  assert.equal(c1.impuestos, 32, "IVA 16% sobre 200");
  assert.equal(c1.total, 232);
  assert.equal(c1.estado, "borrador");
  assert.match(c1.folio, /^COT-/);
  assert.match(c1.enlace, /^https:\/\/crm\.prueba\.test\/cotizacion\/[0-9a-f]{32}$/);
  const fila = (await q<{ contacto_id: string; oportunidad_id: string; convertir_venta: boolean; creado_por_id: string | null }>(
    "SELECT contacto_id::text, oportunidad_id::text, convertir_venta, creado_por_id::text FROM cotizaciones WHERE id=$1", [c1.id],
  ))[0];
  assert.equal(fila.contacto_id, Q.contacto, "el cliente sale de la conversación, no del cuerpo");
  assert.equal(fila.convertir_venta, false);
  assert.equal(String(c1.oportunidad_id), fila.oportunidad_id);
  assert.equal(
    (await q("SELECT count(*)::int n FROM oportunidades WHERE contacto_id=$1 AND estado='abierto'", [Q.contacto]))[0].n,
    1,
    "cuelga de la oportunidad abierta (creada si no había)",
  );
  assert.equal((await crear({ partidas: [] })).status, 400);
  assert.equal((await crear({ partidas: [{ concepto: "x", cantidad: 1, precio: 1 }] })).status, 400, "concepto libre con precio del bot");
  assert.equal((await crear({ partidas: [{ productoId: producto, cantidad: 1, descuento: 50 }] })).status, 400, "descuento por renglón del bot");
  assert.equal((await crear({ descuento: 50 })).status, 400, "descuento general del bot");
  assert.equal((await crear({ partidas: [{ productoId: "999999999", cantidad: 1 }] })).status, 404);
  assert.equal((await crear({}, "B")).status, 403, "otro canal");
  assert.equal((await crear({}, "org2")).status, 404, "otra empresa");
  assert.equal((await auditoria("cotizacion_creada")).length, 1);
  assert.deepEqual(await textosNotasBot(Q.id), [`🤖 Creó cotización ${c1.folio}`], "una nota; los rechazos no dejan nada");

  // GET lista
  const lst = await (await llamar(getCotizaciones, token("A"), Q.id)).json();
  assert.equal(lst.cotizaciones.length, 1);
  assert.equal((await (await llamar(getCotizaciones, token("A"), Q.id, undefined, { query: "?estado=borrador" })).json()).cotizaciones.length, 1);
  assert.equal((await (await llamar(getCotizaciones, token("A"), Q.id, undefined, { query: "?estado=aceptada" })).json()).cotizaciones.length, 0);
  assert.equal((await llamar(getCotizaciones, token("A"), Q.id, undefined, { query: "?estado=otra" })).status, 400);
  await q("UPDATE cotizaciones SET estado='enviada', vigencia = current_date - 5 WHERE id=$1", [c1.id]);
  const vencidas = await (await llamar(getCotizaciones, token("A"), Q.id, undefined, { query: "?estado=vencida" })).json();
  assert.equal(vencidas.cotizaciones.length, 1, "enviada fuera de vigencia se reporta vencida");
  assert.equal(vencidas.cotizaciones[0].estado_guardado, "enviada");
  assert.equal((await llamar(getCotizaciones, token("B"), Q.id)).status, 403);
  assert.equal((await llamar(getCotizaciones, token("org2"), Q.id)).status, 404);
  assert.ok(!JSON.stringify(vencidas).includes("respondido"), "no expone IP ni datos de respuesta");

  // POST send: Meta simulado
  const llamadasMeta: { url: string; body: string }[] = [];
  let plantillas: unknown[] = [];
  let modoPlantillas: "ok" | "5xx" | "red" | "4xx" = "ok";
  const fetchReal = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    llamadasMeta.push({ url: u, body: String(init?.body ?? "") });
    if (u.includes("message_templates")) {
      if (modoPlantillas === "red") throw new TypeError("fetch failed");
      if (modoPlantillas === "5xx") return Response.json({ error: { message: "caído" } }, { status: 503 });
      if (modoPlantillas === "4xx") return Response.json({ error: { message: "token vencido", code: 190 } }, { status: 401 });
      return Response.json({ data: plantillas });
    }
    if (u.endsWith("/messages")) return Response.json({ messages: [{ id: `wamid.PRUEBA-${sufijo}-${llamadasMeta.length}` }] });
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  try {
    await q("UPDATE canales_whatsapp SET config = $2::jsonb WHERE id=$1", [canalA, JSON.stringify({ token: "tk", phoneNumberId: "111", wabaId: "222" })]);
    await q("UPDATE cotizaciones SET estado='borrador', vigencia = current_date + 10 WHERE id=$1", [c1.id]);
    const enviar = (id: string | number, conv = Q.id, tk = "A") =>
      llamar(postEnviarCotizacion, token(tk), conv, {}, { params: { quoteId: String(id) } });

    // Ventana abierta → texto libre
    await q("INSERT INTO mensajes (org_id, conversacion_id, direccion, contenido) VALUES ($1,$2,'entrante','hola')", [o, Q.id]);
    const ok = await enviar(c1.id);
    assert.equal(ok.status, 200);
    const okJ = await ok.json();
    assert.equal(okJ.forma, "texto");
    assert.equal(okJ.estado, "enviada");
    assert.match(okJ.enlace, /\/cotizacion\/[0-9a-f]{32}$/);
    assert.ok(llamadasMeta.some((l) => l.url.endsWith("/111/messages") && l.body.includes('"type":"text"')));
    assert.equal((await q("SELECT estado FROM cotizaciones WHERE id=$1", [c1.id]))[0].estado, "enviada");
    assert.equal((await auditoria("cotizacion_enviada")).length, 1);
    assert.ok((await textosNotasBot(Q.id)).includes(`🤖 Envió cotización ${c1.folio} por WhatsApp`));

    // Aislamiento: cotización de otro contacto, otro canal, otra empresa
    const otra = await nuevaConversacion();
    assert.equal((await enviar(c1.id, otra.id)).status, 404, "la cotización es de otro contacto");
    assert.equal((await enviar(c1.id, Q.id, "B")).status, 403);
    assert.equal((await enviar(c1.id, Q.id, "org2")).status, 404);
    assert.equal((await enviar("abc")).status, 400);

    // Ventana cerrada sin plantilla configurada → 409 con motivo
    await q("UPDATE mensajes SET timestamp = now() - interval '48 hours' WHERE conversacion_id=$1 AND direccion='entrante'", [Q.id]);
    await q("UPDATE cotizaciones SET estado='borrador' WHERE id=$1", [c1.id]);
    const cerrada = await enviar(c1.id);
    assert.equal(cerrada.status, 409);
    assert.equal((await cerrada.json()).motivo, "ventana_cerrada_sin_plantilla");

    // Plantilla configurada pero no aprobada → 409
    await modulo("cotizaciones", true, { plantillaCotizacion: { name: "cotizacion_v1", language: "es_MX" } });
    // Canal sin wabaId: no es "plantilla no aprobada", es falta de configuración del canal.
    await q("UPDATE canales_whatsapp SET config = $2::jsonb WHERE id=$1", [canalA, JSON.stringify({ token: "tk", phoneNumberId: "111" })]);
    const sinWaba = await enviar(c1.id);
    assert.equal(sinWaba.status, 409);
    assert.equal((await sinWaba.json()).motivo, "canal_sin_waba");
    assert.ok(!llamadasMeta.some((l) => l.url.includes("undefined") || l.url.includes("//message_templates")), "no consulta Meta sin wabaId");
    await q("UPDATE canales_whatsapp SET config = $2::jsonb WHERE id=$1", [canalA, JSON.stringify({ token: "tk", phoneNumberId: "111", wabaId: "222" })]);

    plantillas = [{ name: "cotizacion_v1", language: "es_MX", status: "PENDING" }];
    const pendiente = await enviar(c1.id);
    assert.equal(pendiente.status, 409);
    assert.equal((await pendiente.json()).motivo, "plantilla_no_aprobada");

    // Meta no respondió: 503 meta_no_disponible (distinto de "sin plantilla aprobada")
    plantillas = [{ name: "cotizacion_v1", language: "es_MX", status: "APPROVED" }];
    for (const modo of ["5xx", "red"] as const) {
      modoPlantillas = modo;
      const caida = await enviar(c1.id);
      assert.equal(caida.status, 503, `Meta ${modo}`);
      assert.equal((await caida.json()).motivo, "meta_no_disponible");
    }
    modoPlantillas = "4xx";
    const rechazo = await enviar(c1.id);
    assert.equal(rechazo.status, 502);
    assert.equal((await rechazo.json()).motivo, "meta_rechazo");
    modoPlantillas = "ok";
    plantillas = [];
    assert.equal((await (await enviar(c1.id)).json()).motivo, "plantilla_no_aprobada", "Meta respondió sin plantillas");

    // Aprobada → plantilla
    plantillas = [{ name: "cotizacion_v1", language: "es_MX", status: "APPROVED" }];
    const conPlantilla = await enviar(c1.id);
    assert.equal(conPlantilla.status, 200);
    assert.equal((await conPlantilla.json()).forma, "plantilla");
    assert.ok(llamadasMeta.some((l) => l.body.includes('"type":"template"') && l.body.includes("cotizacion_v1")));

    // Cotización ya aceptada no se reenvía
    await q("UPDATE cotizaciones SET estado='aceptada' WHERE id=$1", [c1.id]);
    assert.equal((await enviar(c1.id)).status, 409);
  } finally {
    globalThis.fetch = fetchReal;
  }

  // Módulo de cotizaciones apagado
  await modulo("cotizaciones", false);
  assert.equal((await crear()).status, 404);
  assert.equal((await llamar(getCotizaciones, token("A"), Q.id)).status, 404);
  assert.equal((await llamar(postEnviarCotizacion, token("A"), Q.id, {}, { params: { quoteId: String(c1.id) } })).status, 404);
  await modulo("cotizaciones", true);
}

async function limpiar() {
  const c = await admin.connect();
  try {
    await c.query("SET session_replication_role = replica");
    const tablas = await c.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='org_id'");
    for (const org of [orgId, orgId + 1n, orgId + 2n, orgId + 3n, orgId + 4n, orgId + 5n, orgId + 6n]) {
      for (const { table_name } of tablas.rows) await c.query(`DELETE FROM "${table_name}" WHERE org_id = $1`, [org.toString()]);
      await c.query("DELETE FROM orgs WHERE id = $1", [org.toString()]);
    }
  } finally {
    c.release();
  }
}

async function probarParidadBot(org: bigint) {
  const o = org.toString();
  const otro = (org + 1n).toString();
  const marca = `paridad-${sufijo}`;
  await q("INSERT INTO orgs (id,nombre,slug) VALUES ($1,'Paridad',$2),($3,'Otra paridad',$4)", [o, marca, otro, `${marca}-otro`]);
  const canal = await uno("INSERT INTO canales_whatsapp (org_id,nombre,proveedor,config) VALUES ($1,'Cloud','cloud_api',$2::jsonb) RETURNING id::text AS id", [o, JSON.stringify({ token: "prueba", phoneNumberId: `9${org}` })]);
  const canalB = await uno("INSERT INTO canales_whatsapp (org_id,nombre,proveedor) VALUES ($1,'B','cloud_api') RETURNING id::text AS id", [o]);
  const canalOtro = await uno("INSERT INTO canales_whatsapp (org_id,nombre,proveedor) VALUES ($1,'Otro','cloud_api') RETURNING id::text AS id", [otro]);
  const token = (n: string) => `${marca}-${n}`;
  await q("INSERT INTO bots (org_id,nombre,webhook_url,api_token,canal_id,permisos) VALUES ($1,'bot','https://8.8.8.8/h',$2,$3,$4::text[]),($1,'viejo','https://8.8.8.8/h',$5,$3,$6::text[]),($1,'canalB','https://8.8.8.8/h',$7,$8,$4::text[]),($9,'ajeno','https://8.8.8.8/h',$10,$11,$4::text[])",
    [o, token("full"), canal, PERMISOS_BOT, token("viejo"), PERMISOS_MINIMOS, token("canalB"), canalB, otro, token("ajeno"), canalOtro]);
  const contacto = await uno("INSERT INTO contactos (org_id,nombre,telefono,campos) VALUES ($1,'Ana','525500001234',$2::jsonb) RETURNING id::text AS id", [o, JSON.stringify({ ciudad: "Tuxtla", antiguo: "preservar" })]);
  const conv = await uno("INSERT INTO conversaciones (org_id,contacto_id,canal_id) VALUES ($1,$2,$3) RETURNING id::text AS id", [o, contacto, canal]);
  const contactoOtro = await uno("INSERT INTO contactos (org_id,nombre,telefono) VALUES ($1,'Ajena','525500009999') RETURNING id::text AS id", [otro]);
  await q("INSERT INTO conversaciones (org_id,contacto_id,canal_id) VALUES ($1,$2,$3)", [otro, contactoOtro, canalOtro]);
  const usuario = await uno("INSERT INTO usuarios (org_id,nombre,email,password_hash) VALUES ($1,'Asesor',$2,'x') RETURNING id::text AS id", [o, `${marca}@example.com`]);
  const segundo = await uno("INSERT INTO usuarios (org_id,nombre,email,password_hash) VALUES ($1,'Segundo',$2,'x') RETURNING id::text AS id", [o, `${marca}-segundo@example.com`]);
  const inactivo = await uno("INSERT INTO usuarios (org_id,nombre,email,password_hash,activo) VALUES ($1,'Inactivo',$2,'x',false) RETURNING id::text AS id", [o, `${marca}-inactivo@example.com`]);
  const cajero = await uno("INSERT INTO usuarios (org_id,nombre,email,password_hash,puesto) VALUES ($1,'Cajero',$2,'x','Cajero') RETURNING id::text AS id", [o, `${marca}-cajero@example.com`]);
  const usuarioOtro = await uno("INSERT INTO usuarios (org_id,nombre,email,password_hash) VALUES ($1,'Ajeno',$2,'x') RETURNING id::text AS id", [otro, `${marca}-ajeno@example.com`]);
  await q("INSERT INTO campos_personalizados (org_id,entidad,clave,etiqueta,tipo,obligatorio) VALUES ($1,'contacto','ciudad','Ciudad','texto',true)", [o]);
  await q("INSERT INTO ajustes (org_id,csat_activo) VALUES ($1,true)", [o]);
  await q("INSERT INTO webhook_saliente (org_id,url,secreto,eventos) VALUES ($1,'https://8.8.8.8/evento',$2,ARRAY['conversacion.estado_cambiado'])", [o, encryptMetaToken("prueba")]);
  await q("INSERT INTO auditoria_bot (org_id,bot_id,conversacion_id,accion,despues) SELECT $1,id,$2,'handoff',$3::jsonb FROM bots WHERE api_token=$4", [o, conv, JSON.stringify({ responsableId: usuario }), token("full")]);
  const siguiente = () => transaccionTenant(org, (tx) => elegirAsesor(tx, { asesorId: null }));
  assert.equal((await siguiente())?.id, BigInt(segundo));
  const llamarNuevo = (handler: Handler, cuerpo?: unknown, opciones: Opciones = {}, tk = "full", id = conv) =>
    llamar(handler, token(tk), id, cuerpo, opciones);

  for (const [handler, cuerpo, metodo, permiso] of [
    [patchStatus, { status: "resolved" }, "PATCH", "cambiar_estado"],
    [postAssignments, { assignee_id: usuario }, "POST", "asignar"],
    [patchContactos, { nombre: "Nueva Ana" }, "PATCH", "editar_contacto"]
  ] as const) {
    const r = await llamarNuevo(handler, cuerpo, { metodo }, "viejo");
    assert.equal(r.status, 403);
    assert.equal((await r.json()).motivo, "permiso_faltante");
    assert.equal((await q<{ n: number }>("SELECT count(*)::int n FROM auditoria_bot WHERE org_id=$1 AND accion='permiso_denegado' AND despues->>'permiso'=$2", [o, permiso]))[0].n, 1);
  }
  assert.equal((await llamarNuevo(getConversacion, undefined, {}, "viejo")).status, 200, "el bot viejo conserva lectura");
  assert.equal((await llamarNuevo(postMessages, { content: "nota", private: true }, {}, "viejo")).status, 200, "el bot viejo conserva notas");

  const enviados: string[] = [];
  const eventos: Array<{ evento: string; datos: { origen?: string } }> = [];
  const fetchOriginal = globalThis.fetch;
  const requestOriginal = https.request;
  https.request = ((_url: unknown, _options: unknown, callback: (res: unknown) => void) => {
    const peticion = new EventEmitter() as EventEmitter & { end: (body: string) => void; destroy: (error: Error) => void };
    peticion.destroy = (error) => peticion.emit("error", error);
    peticion.end = (body) => {
      eventos.push(JSON.parse(body));
      queueMicrotask(() => { callback({ statusCode: 200, resume() {} }); peticion.emit("close"); });
    };
    return peticion;
  }) as typeof https.request;
  syncBuiltinESMExports();
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    enviados.push(String(init?.body ?? ""));
    return Response.json({ messages: [{ id: `wamid.${enviados.length}` }] });
  }) as typeof fetch;
  try {
    const estado = (status: string) => llamarNuevo(patchStatus, { status }, { metodo: "PATCH" });
    assert.equal((await estado("mal")).status, 400);
    assert.deepEqual(await (await estado("open")).json(), { id: Number(conv), status: "open", status_anterior: "open", cambio: false });
    assert.equal((await estado("resolved")).status, 200);
    await esperarWebhooks();
    assert.equal(eventos.at(-1)?.datos.origen, "bot");
    const totalEventos = eventos.length;
    const csat = () => q<{ n: number }>("SELECT count(*)::int n FROM mensajes WHERE conversacion_id=$1 AND contenido LIKE '%calificarías%'", [conv]);
    assert.equal((await csat())[0].n, 1);
    const marcas = (await q<{ updated_at: Date }>("SELECT updated_at FROM conversaciones WHERE id=$1", [conv]))[0].updated_at;
    assert.equal((await (await estado("resolved")).json()).cambio, false);
    await esperarWebhooks();
    assert.equal(eventos.length, totalEventos, "no-op no emite webhook");
    assert.equal((await csat())[0].n, 1, "no-op no duplica CSAT");
    assert.equal((await q<{ updated_at: Date }>("SELECT updated_at FROM conversaciones WHERE id=$1", [conv]))[0].updated_at.getTime(), marcas.getTime(), "no-op no escribe");
    assert.equal((await estado("open")).status, 200);
    assert.equal((await q<{ bot_activo: boolean }>("SELECT bot_activo FROM conversaciones WHERE id=$1", [conv]))[0].bot_activo, true);
    assert.equal((await estado("resolved")).status, 200);
    assert.equal((await csat())[0].n, 1, "CSAT se envía una sola vez tras reabrir");
    assert.equal((await (await estado("pending")).json()).status_anterior, "resolved");
    assert.equal((await q<{ n: number }>("SELECT count(*)::int n FROM auditoria_bot WHERE conversacion_id=$1 AND accion='estado_cambiado'", [conv]))[0].n, 4);

    const asignar = (id: string | null, tk = "full", c = conv) => llamarNuevo(postAssignments, { assignee_id: id }, {}, tk, c);
    assert.equal((await asignar(usuarioOtro)).status, 400);
    assert.equal((await asignar(inactivo)).status, 422);
    assert.equal((await asignar(cajero)).status, 422);
    assert.equal((await asignar(usuario, "canalB")).status, 403);
    assert.equal((await asignar(usuario, "ajeno")).status, 404);
    assert.equal((await (await asignar(usuario)).json()).responsable.id, Number(usuario));
    assert.equal((await (await asignar(null)).json()).responsable, null);
    assert.equal((await siguiente())?.id, BigInt(segundo), "asignada no altera la rotación handoff");

    const editar = (body: unknown, tk = "full") => llamarNuevo(patchContactos, body, { metodo: "PATCH" }, tk);
    assert.equal((await editar({ telefono: "525500001111" })).status, 400);
    assert.equal((await editar({ campos: { desconocido: "x" } })).status, 400);
    assert.equal((await editar({ nombre: "Ana Editada", campos: { ciudad: "Comitán" } }, "canalB")).status, 403);
    assert.equal((await editar({ nombre: "Ana Editada", campos: { ciudad: "Comitán" } }, "ajeno")).status, 404);
    const editado = await (await editar({ nombre: "Ana Editada", campos: { ciudad: "Comitán" } })).json();
    assert.deepEqual(editado.contacto.campos, { ciudad: "Comitán", antiguo: "preservar" });
    assert.deepEqual((await (await editar({ campos: { ciudad: null } })).json()).contacto.campos, { antiguo: "preservar" });
    const buscar = (query: string, tk = "full") => llamarNuevo(getContactos, undefined, { query }, tk);
    assert.equal((await buscar("?q=A")).status, 400);
    assert.equal((await buscar("?q=Ana&phone=525500001234")).status, 400);
    assert.equal((await buscar("?q=Ana", "canalB")).status, 403);
    const buscados = await (await buscar("?q=ana")).json();
    assert.ok(buscados.contactos.some((c: { id: number }) => c.id === Number(contacto)));
    assert.ok(buscados.contactos.every((c: { nombre: string }) => c.nombre !== "Ajena"));
    const lista = await (await llamarNuevo(getConversaciones, undefined, { query: `?contact_id=${contacto}` })).json();
    assert.equal(lista.payload.length, 1);
    assert.equal((await (await llamarNuevo(getConversaciones, undefined, { query: `?contact_id=${contactoOtro}` })).json()).payload.length, 0);
    assert.equal((await llamarNuevo(getConversaciones, undefined, { query: "?contact_id=0" })).status, 400);

    const mensaje = (body: unknown) => llamarNuevo(postMessages, body);
    assert.equal((await mensaje({ content: "a", attachments: [{ file_type: "image", data_url: "http://8.8.8.8/a" }] })).status, 400);
    assert.equal((await mensaje({ content: "a", attachments: [{ file_type: "otro", data_url: "https://8.8.8.8/a" }] })).status, 400);
    assert.equal((await mensaje({ content: "a", attachments: [{ file_type: "image", data_url: "https://8.8.8.8/a" }, { file_type: "image", data_url: "https://8.8.8.8/b" }] })).status, 400);
    assert.equal((await mensaje({ content: "a", attachments: [{ file_type: "image", data_url: "https://u:p@8.8.8.8/a" }] })).status, 400);
    assert.equal((await mensaje({ content: "a", attachments: [{ file_type: "image", data_url: "https://127.0.0.1/a" }] })).status, 400);
    assert.equal((await mensaje({ content: "a", private: true, attachments: [{ file_type: "image", data_url: "https://8.8.8.8/a" }] })).status, 400);
    await q("INSERT INTO mensajes (org_id,conversacion_id,direccion,contenido) VALUES ($1,$2,'entrante','hola')", [o, conv]);
    const texto = await mensaje({ content: "texto" });
    assert.equal(texto.status, 200);
    assert.deepEqual(Object.keys(await texto.json()).sort(), ["content", "conversation_id", "created_at", "id", "message_type"].sort(), "respuesta de texto intacta");
    const media = await mensaje({ content: "pie", attachments: [{ file_type: "image", data_url: "https://8.8.8.8/imagen.png" }] });
    assert.equal(media.status, 200);
    const mediaId = (await media.json()).id;
    assert.deepEqual((await q<{ tipo: string; media_url: string }>("SELECT tipo,media_url FROM mensajes WHERE id=$1", [mediaId]))[0], { tipo: "imagen", media_url: "https://8.8.8.8/imagen.png" });
    await q("UPDATE mensajes SET timestamp=now()-interval '48 hours' WHERE conversacion_id=$1 AND direccion='entrante'", [conv]);
    assert.equal((await mensaje({ content: "fuera", attachments: [{ file_type: "audio", data_url: "https://8.8.8.8/audio.ogg" }] })).status, 400);
    assert.ok(enviados.some((body) => body.includes('"type":"image"')), "la media entró al provider");
  } finally {
    await esperarWebhooks();
    https.request = requestOriginal;
    syncBuiltinESMExports();
    globalThis.fetch = fetchOriginal;
  }
}

main()
  .catch((e) => {
    console.error("FALLO:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await limpiar().catch((e) => console.error("No se pudo limpiar:", e.message));
    servidor.close();
    await Promise.all([admin.end(), dbRaw.$disconnect()]);
  });

// ---------------------------------------------------------------------------------------------
// Bloque 4: permisos por bot, productos, oportunidad y contactos
// ---------------------------------------------------------------------------------------------
async function bloque5(o: string, ctx: Ctx) {
  const { canalA, canalB, token, conv } = ctx;
  const org2 = (orgId + 1n).toString();
  let seq = 0;
  const nueva = async (canal: string, org = o) => {
    const c = await uno(
      `INSERT INTO contactos (org_id, nombre, telefono) VALUES ($1,$2,$3) RETURNING id::text AS id`,
      [org, `B4-${seq}`, `55${Date.now()}${seq++}`],
    );
    return {
      contacto: c,
      id: await uno(`INSERT INTO conversaciones (org_id, contacto_id, canal_id) VALUES ($1,$2,$3) RETURNING id::text AS id`, [org, c, canal]),
    };
  };
  const bot = (nombre: string, permisos: string[] | null, canal: string | null = canalA, org = o) =>
    q(
      permisos === null
        ? `INSERT INTO bots (org_id, nombre, webhook_url, api_token, canal_id) VALUES ($1,$2,'https://8.8.8.8/h',$3,$4)`
        : `INSERT INTO bots (org_id, nombre, webhook_url, api_token, canal_id, permisos) VALUES ($1,$2,'https://8.8.8.8/h',$3,$4,$5::text[])`,
      permisos === null ? [org, nombre, token(nombre), canal] : [org, nombre, token(nombre), canal, permisos],
    );
  const permisosDe = async (nombre: string) =>
    (await q<{ permisos: string[] }>("SELECT permisos FROM bots WHERE org_id=$1 AND api_token=$2", [o, token(nombre)]))[0].permisos;
  const modulo = (clave: string, activo: boolean) =>
    q(
      `INSERT INTO modulos_org (org_id, clave, activo) VALUES ($1,$2,$3)
       ON CONFLICT (org_id, clave) DO UPDATE SET activo = EXCLUDED.activo`,
      [o, clave, activo],
    );
  const auditoria = (accion: string) =>
    q<{ conversacion_id: string | null; despues: Record<string, unknown> }>(
      "SELECT conversacion_id::text, despues FROM auditoria_bot WHERE org_id=$1 AND accion=$2 ORDER BY id",
      [o, accion],
    );

  // ---------- 4A. Permisos ----------
  assert.deepEqual(permisosValidos(["handoff", "handoff", "cotizar"]), ["handoff", "cotizar"]);
  assert.equal(permisosValidos(["handoff", "volar"]), null);
  assert.equal(permisosValidos("handoff"), null);

  await bot("min", null); // nace con el conjunto mínimo (DEFAULT de la base)
  assert.deepEqual([...(await permisosDe("min"))].sort(), [...PERMISOS_MINIMOS].sort(), "un bot nuevo nace con el mínimo");
  const C = await nueva(canalA);
  const cuerpoCita = { fecha: sumarDias(fechaLocal(new Date(), "America/Mexico_City"), 3), hora: "09:00", servicioId: 1 };

  assert.equal((await llamar(getConversacion, token("min"), C.id)).status, 200, "con permiso mínimo lee el perfil");
  const sinCita = await llamar(postCitas, token("min"), C.id, cuerpoCita);
  assert.equal(sinCita.status, 403);
  const denegado = await sinCita.json();
  assert.equal(denegado.motivo, "permiso_faltante");
  assert.equal(denegado.permiso, "agendar_cita");
  const filas = await auditoria("permiso_denegado");
  assert.ok(filas.some((f) => f.conversacion_id === C.id && f.despues.permiso === "agendar_cita"), "la denegación queda en la bitácora");
  // El perfil sigue disponible aunque otra acción esté denegada.
  assert.equal((await llamar(getConversacion, token("min"), C.id)).status, 200);

  const denegadas: [string, Handler, unknown, Opciones, string][] = [
    ["mover_embudo", postFunnel, { etapa: "Nuevo" }, {}, "funnel"],
    ["crear_tarea", postTasks, { titulo: "x" }, {}, "tasks"],
    ["cotizar", postCotizaciones, { partidas: [{ concepto: "x", cantidad: 1, precio: 1 }] }, {}, "quotes POST"],
    ["cotizar", getCotizaciones, undefined, {}, "quotes GET"],
    ["agendar_cita", getCitas, undefined, {}, "appointments GET"],
    ["agendar_cita", getDisponibilidad, undefined, { query: "?fecha=2030-01-01" }, "availability"],
    ["ver_productos", getProductos, undefined, {}, "products"],
    ["editar_oportunidad", patchOportunidad, { valor: 10 }, { metodo: "PATCH" }, "opportunity"],
    ["gestionar_contactos", getContactos, undefined, { query: "?phone=5599999999" }, "contacts GET"],
    ["gestionar_contactos", postContactos, { nombre: "x", telefono: "5599999999" }, {}, "contacts POST"],
  ];
  for (const [permiso, handler, cuerpo, opciones, nombre] of denegadas) {
    const r = await llamar(handler, token("min"), C.id, cuerpo, opciones);
    assert.equal(r.status, 403, `${nombre} sin ${permiso}`);
    assert.equal((await r.json()).permiso, permiso, nombre);
  }
  // Con el mínimo sí puede: nota interna, handoff y etiquetas.
  assert.equal((await llamar(postMessages, token("min"), C.id, { content: "nota", private: true })).status, 200);
  assert.equal((await llamar(postLabels, token("min"), C.id, { labels: ["vip"] })).status, 200);
  // Mensaje y nota son permisos distintos.
  await bot("soloperfil", ["leer_perfil"]);
  const msg = await llamar(postMessages, token("soloperfil"), C.id, { content: "hola" });
  assert.equal(msg.status, 403);
  assert.equal((await msg.json()).permiso, "enviar_mensaje");
  const nota = await llamar(postMessages, token("soloperfil"), C.id, { content: "n", private: true });
  assert.equal(nota.status, 403);
  assert.equal((await nota.json()).permiso, "notas_internas");
  // El admin activa un permiso y funciona (la columna es la fuente de verdad).
  assert.equal((await llamar(getCotizaciones, token("soloperfil"), C.id)).status, 403);
  await q("UPDATE bots SET permisos = array_append(permisos, 'cotizar') WHERE api_token=$1", [token("soloperfil")]);
  assert.equal((await llamar(getCotizaciones, token("soloperfil"), C.id)).status, 200);
  // El permiso no sustituye al canal: con permiso pero en otro canal, 403 de canal.
  await bot("canalB-todo", [...PERMISOS_BOT], canalB);
  const otroCanal = await llamar(getConversacion, token("canalB-todo"), C.id);
  assert.equal(otroCanal.status, 403);
  assert.equal((await otroCanal.json()).motivo, undefined, "es el 403 de canal, no el de permiso");

  // ---------- 4A. Migración: los bots existentes conservan su comportamiento ----------
  const sql = await readFile("prisma/sql/actualizaciones.sql", "utf8");
  const bloqueE = sql.slice(sql.indexOf("-- Bot API · permisos por bot."));
  assert.ok(bloqueE.includes("ALTER TABLE bots ADD COLUMN IF NOT EXISTS permisos"), "bloque de migración encontrado");
  // Simula la base anterior: columna sin default y sin NOT NULL, con un bot que ya existía.
  await q("ALTER TABLE bots ALTER COLUMN permisos DROP NOT NULL");
  await q("ALTER TABLE bots ALTER COLUMN permisos DROP DEFAULT");
  await bot("legado", null);
  await q("UPDATE bots SET permisos = NULL WHERE api_token=$1", [token("legado")]);
  await q(bloqueE);
  // Solo lo que sus rutas de producción permitían; tareas, citas y cotizaciones no existían allí.
  const esperados = ["leer_perfil", "enviar_mensaje", "notas_internas", "mover_embudo", "handoff"];
  const noRecibe = ["crear_tarea", "agendar_cita", "cotizar", "editar_oportunidad", "ver_productos", "gestionar_contactos"];
  const migrados = await permisosDe("legado");
  assert.deepEqual([...migrados].sort(), [...esperados].sort(), "el bot existente conserva solo sus 5 permisos");
  for (const p of noRecibe) assert.ok(!migrados.includes(p), `el bot existente no debe recibir ${p}`);
  assert.equal(
    (await q<{ is_nullable: string }>("SELECT is_nullable FROM information_schema.columns WHERE table_name='bots' AND column_name='permisos'"))[0].is_nullable,
    "NO",
  );
  // Idempotente: lo que el admin edite no se pisa al volver a correr el archivo.
  await q("UPDATE bots SET permisos = ARRAY['leer_perfil'] WHERE api_token=$1", [token("legado")]);
  await q(bloqueE);
  assert.deepEqual(await permisosDe("legado"), ["leer_perfil"]);
  await q("UPDATE bots SET permisos = ARRAY[" + esperados.map((p) => `'${p}'`).join(",") + "] WHERE api_token=$1", [token("legado")]);
  await q(bloqueE);
  assert.deepEqual([...(await permisosDe("legado"))].sort(), [...esperados].sort(), "tras volver a correr el bloque sigue igual");
  // Las rutas que existían en producción siguen funcionando con el bot migrado…
  const L = await nueva(canalA);
  await q("INSERT INTO mensajes (org_id, conversacion_id, direccion, contenido) VALUES ($1,$2,'entrante','hola')", [o, L.id]);
  const dia = sumarDias(fechaLocal(new Date(), "America/Mexico_City"), 3);
  const vigentes: [string, Handler, unknown, Opciones][] = [
    ["GET conversación", getConversacion, undefined, {}],
    ["messages (nota)", postMessages, { content: "n", private: true }, {}],
    ["funnel", postFunnel, { etapa: "Nuevo" }, {}],
    ["labels", postLabels, { labels: ["x"] }, {}],
  ];
  for (const [nombre, handler, cuerpo, opciones] of vigentes) {
    const r = await llamar(handler, token("legado"), L.id, cuerpo, opciones);
    assert.notEqual(r.status, 403, `${nombre} con el bot migrado`);
    assert.ok(r.status < 500, `${nombre}: ${r.status}`);
  }
  // …y lo que no existía en producción queda apagado hasta que se contrate (403 permiso_faltante).
  const apagadas: [string, Handler, unknown, Opciones, string][] = [
    ["tasks", postTasks, { titulo: "t" }, {}, "crear_tarea"],
    ["availability", getDisponibilidad, undefined, { query: `?fecha=${dia}` }, "agendar_cita"],
    ["appointments GET", getCitas, undefined, {}, "agendar_cita"],
    ["appointments POST", postCitas, { fecha: dia, hora: "09:00", servicioId: 1 }, {}, "agendar_cita"],
    ["quotes GET", getCotizaciones, undefined, {}, "cotizar"],
    ["quotes POST", postCotizaciones, { partidas: [{ concepto: "x", cantidad: 1, precio: 10 }] }, {}, "cotizar"],
    ["products", getProductos, undefined, {}, "ver_productos"],
    ["contacts", getContactos, undefined, { query: "?phone=5599999999" }, "gestionar_contactos"],
    ["opportunity", patchOportunidad, { valor: 1 }, { metodo: "PATCH" }, "editar_oportunidad"],
  ];
  for (const [nombre, handler, cuerpo, opciones, permiso] of apagadas) {
    const r = await llamar(handler, token("legado"), L.id, cuerpo, opciones);
    assert.equal(r.status, 403, `${nombre} con el bot migrado`);
    assert.equal((await r.json()).permiso, permiso, nombre);
  }
  // El admin activa tareas, citas y cotizaciones para el cliente que las contrate; queda funcionando.
  await q("UPDATE bots SET permisos = permisos || ARRAY['crear_tarea','agendar_cita','cotizar']::text[] WHERE api_token=$1", [token("legado")]);
  for (const [nombre, handler, cuerpo, opciones] of apagadas.slice(0, 6)) {
    const r = await llamar(handler, token("legado"), L.id, cuerpo, opciones);
    assert.notEqual(r.status, 403, `${nombre} tras activar el permiso`);
    assert.ok(r.status < 500, `${nombre}: ${r.status}`);
  }

  // ---------- 4B. Productos ----------
  await modulo("productos", true);
  const P = await nueva(canalA);
  const producto = (nombre: string, precio: number, stock: number, org = o, extra = "") =>
    uno(
      `INSERT INTO productos (org_id, nombre, precio, stock, sku, descripcion, activo) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id::text AS id`,
      [org, nombre, precio, stock, `sku-${sufijo}-${seq++}${extra}`, `desc ${nombre}`],
    );
  const lampara = await producto("Lámpara LED", 120, 5);
  const mesa = await producto("Mesa de centro", 900, 0);
  const silla = await producto("Silla Nórdica", 450, 7);
  await producto("Lámpara ajena", 1, 99, org2);
  // 3 piezas de la silla en un apartado activo (el stock de 7 ya las descontó).
  const venta = await uno(`INSERT INTO ventas (org_id, folio) VALUES ($1,$2) RETURNING id::text AS id`, [o, `V-AP-${sufijo}`]);
  await q(`INSERT INTO venta_partidas (org_id, venta_id, producto_id, cantidad, precio_unitario, total) VALUES ($1,$2,$3,3,450,1350)`, [o, venta, silla]);
  await q(`INSERT INTO apartados (org_id, venta_id, contacto_id, anticipo, saldo, vence_at, estado) VALUES ($1,$2,$3,100,1250, now() + interval '5 days','activo')`, [o, venta, P.contacto]);

  const buscar = async (query: string, tk = "A", c = P.id) => llamar(getProductos, token(tk), c, undefined, { query });
  const r1 = await (await buscar("?q=lampara")).json();
  assert.deepEqual(r1.productos.map((x: { nombre: string }) => x.nombre), ["Lámpara LED"], "sin acentos y solo de la empresa");
  assert.equal(r1.productos[0].existencia, 5);
  assert.equal(r1.productos[0].precio, 120);
  assert.equal(r1.productos[0].disponible, true);
  const r2 = await (await buscar("?q=silla")).json();
  assert.equal(r2.productos[0].existencia, 7, "el stock ya descuenta lo apartado");
  assert.equal(r2.productos[0].apartada, 3);
  const r3 = await (await buscar("?q=mesa")).json();
  assert.equal(r3.productos[0].disponible, false);
  const todos = await (await buscar("?limit=2")).json();
  assert.equal(todos.productos.length, 2);
  for (const mala of ["?limit=0", "?limit=51", "?limit=abc"]) assert.equal((await buscar(mala)).status, 400, mala);
  assert.equal((await buscar("?q=lampara", "B")).status, 403, "otro canal");
  assert.equal((await buscar("?q=lampara", "org2")).status, 404, "otra empresa no ve la conversación");
  await modulo("productos", false);
  assert.equal((await buscar("?q=lampara")).status, 404, "módulo apagado");
  await modulo("productos", true);
  void lampara;
  void mesa;

  // ---------- 4B. Oportunidad ----------
  const O = await nueva(canalA);
  const usuarios = await q<{ id: string }>("SELECT id::text FROM usuarios WHERE org_id=$1 ORDER BY id", [o]);
  const activo = usuarios[0].id;
  const inactivo = await uno(`INSERT INTO usuarios (org_id, nombre, email, password_hash, activo) VALUES ($1,'off',$2,'x',false) RETURNING id::text AS id`, [o, `off-${sufijo}@x.test`]);
  const ajeno = await uno(`INSERT INTO usuarios (org_id, nombre, email, password_hash) VALUES ($1,'otra',$2,'x') RETURNING id::text AS id`, [org2, `otra-${sufijo}@x.test`]);
  const embudoPpal = (await q<{ id: string }>("SELECT id::text FROM embudos WHERE org_id=$1 AND activo ORDER BY orden, id LIMIT 1", [o]))[0].id;
  void embudoPpal;
  const postventa = await uno(`INSERT INTO embudos (org_id, nombre, orden) VALUES ($1,'Postventa',50) RETURNING id::text AS id`, [o]);
  await q(`INSERT INTO etapas (org_id, embudo_id, nombre, orden, tipo) VALUES ($1,$2,'Seguimiento',0,'normal'),($1,$2,'Resuelto',1,'ganado')`, [o, postventa]);
  const patch = (cuerpo: unknown, tk = "A", c = O.id) => llamar(patchOportunidad, token(tk), c, cuerpo, { metodo: "PATCH" });

  assert.equal((await patch({ valor: 100 })).status, 404, "sin oportunidad abierta");
  await llamar(postFunnel, token("A"), O.id, { etapa: "Nuevo" }); // crea la oportunidad
  const oportunidadId = (await q<{ id: string }>("SELECT id::text FROM oportunidades WHERE contacto_id=$1", [O.contacto]))[0].id;

  const v = await patch({ valor: "1500.50" });
  assert.equal(v.status, 200);
  assert.equal((await v.json()).oportunidad.valor, 1500.5);
  const r = await patch({ responsableId: activo });
  assert.equal((await r.json()).oportunidad.responsableId, activo);
  assert.equal((await patch({ responsableId: inactivo })).status, 400, "usuario inactivo");
  assert.equal((await patch({ responsableId: ajeno })).status, 400, "usuario de otra empresa");
  assert.equal((await patch({ responsableId: "abc" })).status, 400);
  assert.equal((await (await patch({ responsableId: null })).json()).oportunidad.responsableId, null);
  assert.equal((await patch({})).status, 400);
  for (const malo of [{ valor: "abc" }, { valor: -5 }, { valor: "1.234" }]) assert.equal((await patch(malo)).status, 400, JSON.stringify(malo));

  const cambio = await patch({ embudo: "postventa", etapa: "resuelto" });
  assert.equal(cambio.status, 200);
  const cj = (await cambio.json()).oportunidad;
  assert.equal(cj.embudo, "Postventa");
  assert.equal(cj.etapa, "Resuelto");
  assert.equal(cj.estado, "ganado", "la etapa de tipo ganado cierra la oportunidad como funnel");
  // Una oportunidad cerrada ya no es "abierta": el siguiente PATCH da 404 (igual que funnel).
  assert.equal((await patch({ valor: 1 })).status, 404);

  const O2 = await nueva(canalA);
  await llamar(postFunnel, token("A"), O2.id, { etapa: "Nuevo" });
  const soloEmbudo = await patch({ embudo: "Postventa" }, "A", O2.id);
  assert.equal((await soloEmbudo.json()).oportunidad.etapa, "Seguimiento", "sin etapa: la primera del embudo");
  const raro = await patch({ embudo: "NoExiste" }, "A", O2.id);
  assert.equal(raro.status, 400);
  assert.ok((await raro.json()).embudos.includes("Postventa"));
  const sinEtapa = await patch({ embudo: "Postventa", etapa: "Nada" }, "A", O2.id);
  assert.equal(sinEtapa.status, 400);
  assert.ok((await sinEtapa.json()).etapas.includes("Seguimiento"));
  // El valor y el responsable no se aplican si la etapa pedida es inválida (no hay cambios a medias).
  await patch({ valor: 999, embudo: "Postventa", etapa: "Nada" }, "A", O2.id);
  assert.notEqual(
    (await q<{ valor: string }>("SELECT valor::text FROM oportunidades WHERE contacto_id=$1", [O2.contacto]))[0].valor,
    "999.00",
  );

  const eventos = await q<{ tipo: string; payload: { campo?: string } }>(
    "SELECT tipo::text, payload FROM eventos WHERE oportunidad_id=$1 ORDER BY id",
    [oportunidadId],
  );
  assert.ok(eventos.some((e) => e.tipo === "nota" && e.payload.campo === "valor"), "cambio de valor como evento");
  assert.ok(eventos.some((e) => e.tipo === "asignacion" && e.payload.campo === "responsable"), "cambio de responsable como evento");
  assert.ok(eventos.some((e) => e.tipo === "etapa_cambio"), "cambio de etapa como evento");
  const aud = await auditoria("oportunidad_editada");
  assert.ok(aud.length >= 4, "cada PATCH exitoso queda en la bitácora");
  const notasOportunidad = await textosNotasBot(O.id);
  for (const esperada of [
    "🤖 Movió a etapa: Nuevo",
    "🤖 Cambió el valor de la oportunidad a $1500.50 MXN",
    "🤖 Cambió el responsable de la oportunidad",
    "🤖 Quitó el responsable de la oportunidad",
    "🤖 Movió a etapa: Resuelto",
  ]) assert.ok(notasOportunidad.includes(esperada), `falta la nota: ${esperada}`);
  assert.equal((await patch({ valor: 5 }, "B", O2.id)).status, 403, "otro canal");
  assert.equal((await patch({ valor: 5 }, "org2", O2.id)).status, 404, "otra empresa");

  // ---------- 4C. Contactos ----------
  const K = await nueva(canalA);
  const canalOrg2 = (await q<{ canal_id: string }>("SELECT canal_id::text FROM bots WHERE api_token=$1", [token("org2")]))[0].canal_id;
  const k2 = await nueva(canalOrg2, org2);
  const telefono = `55${String(Date.now()).slice(-8)}`; // 10 dígitos
  await q(`INSERT INTO contactos (org_id, nombre, telefono) VALUES ($1,'Otra empresa',$2)`, [org2, `52${telefono}`]);
  const buscarTel = (valor: string, tk = "A", c = K.id) => llamar(getContactos, token(tk), c, undefined, { query: `?phone=${encodeURIComponent(valor)}` });
  assert.deepEqual(await (await buscarTel(telefono)).json(), { encontrado: false, contacto: null }, "el contacto de otra empresa no se ve");
  assert.equal((await buscarTel("123")).status, 400);
  const crear = (cuerpo: unknown, tk = "A", c = K.id) => llamar(postContactos, token(tk), c, cuerpo);
  const nuevo = await crear({ nombre: "  Ana Pérez ", telefono: `+52 ${telefono.slice(0, 2)} ${telefono.slice(2, 6)} ${telefono.slice(6)}`, correo: "ana@example.com" });
  assert.equal(nuevo.status, 201);
  const nj = await nuevo.json();
  assert.equal(nj.repetida, false);
  assert.equal(nj.contacto.nombre, "Ana Pérez");
  assert.equal(nj.contacto.telefono, `52${telefono}`, "se guarda como 52 + 10 dígitos");
  assert.equal(nj.contacto.email, "ana@example.com");
  const dup = await crear({ nombre: "Otra Ana", telefono: `521${telefono}` }); // formato 521…
  assert.equal(dup.status, 200);
  const dj = await dup.json();
  assert.equal(dj.repetida, true);
  assert.equal(dj.contacto.id, nj.contacto.id);
  assert.equal((await q("SELECT count(*)::int n FROM contactos WHERE org_id=$1 AND telefono LIKE $2", [o, `%${telefono}`]))[0].n, 1);
  const hallado = await (await buscarTel(`521${telefono}`)).json();
  assert.equal(hallado.encontrado, true);
  assert.equal(hallado.contacto.id, nj.contacto.id);
  // Un contacto que llegó de WhatsApp con 521… también se encuentra por sus 10 dígitos.
  const tel521 = `55${String(Date.now()).slice(-7)}1`;
  await q(`INSERT INTO contactos (org_id, nombre, telefono) VALUES ($1,'Legado 521',$2)`, [o, `521${tel521}`]);
  assert.equal((await (await buscarTel(tel521)).json()).contacto.nombre, "Legado 521");
  assert.equal((await crear({ nombre: "x", telefono: "123" })).status, 400);
  assert.equal((await crear({ nombre: "", telefono: telefono })).status, 400);
  assert.equal((await crear({ nombre: "x", telefono: "5512345678", correo: "no-es-correo" })).status, 400);
  // Crear simultáneo del mismo teléfono: uno solo se crea.
  const telCarrera = `55${String(Date.now()).slice(-6)}77`;
  const carrera = await Promise.all([1, 2, 3, 4, 5].map((n) => crear({ nombre: `Carrera ${n}`, telefono: telCarrera })));
  const estados = carrera.map((c) => c.status).sort();
  assert.deepEqual(estados, [200, 200, 200, 200, 201]);
  assert.equal((await q("SELECT count(*)::int n FROM contactos WHERE org_id=$1 AND telefono = $2", [o, `52${telCarrera}`]))[0].n, 1);
  // Aislamiento
  assert.equal((await buscarTel(telefono, "B")).status, 403, "otro canal");
  assert.equal((await buscarTel(telefono, "org2", K.id)).status, 404, "otra empresa sobre mi conversación");
  const propio2 = await (await buscarTel(telefono, "org2", k2.id)).json();
  assert.equal(propio2.contacto.nombre, "Otra empresa", "el bot de la otra empresa solo ve lo suyo");
  assert.equal((await auditoria("contacto_creado")).length >= 2, true);
  const notasContactos = await textosNotasBot(K.id);
  assert.equal(notasContactos.filter((t) => t === "🤖 Creó contacto: Ana Pérez").length, 1, "el contacto repetido no deja nota");
  assert.equal(notasContactos.length, 2, "solo los dos contactos realmente creados (Ana y el ganador de la carrera)");
}
