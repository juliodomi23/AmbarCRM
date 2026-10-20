import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createRequire, registerHooks } from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";
import { mock } from "node:test";
import pg from "pg";
import bcrypt from "bcryptjs";

const appUrl = process.env.DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
for (const valor of [appUrl, adminUrl]) {
  assert.ok(valor, "Define DATABASE_URL y ADMIN_DATABASE_URL de la BD desechable");
  const url = new URL(valor);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "55461" && url.pathname === "/crm_recuperar", "Solo se permite la BD desechable local de esta prueba");
}
assert.equal(new URL(appUrl!).username, "crm_app");
process.env.NEXTAUTH_URL = "https://crm.prueba.test";
process.env.NEXTAUTH_SECRET = "secreto-exclusivo-para-pruebas-desechables";
Object.assign(process.env, { SMTP_HOST: "smtp.invalid", SMTP_PORT: "587", SMTP_SECURE: "false", SMTP_USER: "prueba", SMTP_PASSWORD: "simulada", SMTP_FROM: "AmbarCRM <prueba@example.test>" });

const cargar = createRequire(import.meta.url);
const smtp = cargar("./lib/smtp-simulado.cjs");
const hooks = registerHooks({ resolve(specifier, context, siguiente) {
  if (specifier === "nodemailer") return { url: new URL("./lib/smtp-simulado.cjs", import.meta.url).href, shortCircuit: true };
  return siguiente(specifier, context);
} });
// Next instala AsyncLocalStorage al arrancar; aquí solo simulamos el cierre del request.
Object.assign(globalThis, { AsyncLocalStorage });
const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external.js");
const { workUnitAsyncStorage } = await import("next/dist/server/app-render/work-unit-async-storage.external.js");
const { NextRequest } = await import("next/server");
const { POST: recuperar } = await import("../src/app/api/auth/recuperar/route");
const { POST: restablecer } = await import("../src/app/api/auth/restablecer/route");
const { dbRaw, runWithOrg, db } = await import("../src/lib/db");
const { correoConfigurado, enviarCorreo } = await import("../src/lib/correo");
const { MENSAJE_RECUPERAR, ERROR_TOKEN } = await import("../src/lib/recuperar-password");
const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
const sufijo = randomBytes(5).toString("hex");
const slugA = `recuperar-a-${sufijo}`;
const slugB = `recuperar-b-${sufijo}`;
let orgA: bigint;
let orgB: bigint;
let usuarioA: bigint;
let usuarioB: bigint;
const email = `cuenta-${sufijo}@example.test`;
const nueva = "NuevaClave123!";
const logs: string[] = [];
const logInfo = mock.method(console, "info", (...args: unknown[]) => logs.push(args.join(" ")));
const logError = mock.method(console, "error", (...args: unknown[]) => logs.push(args.join(" ")));
let contadorIp = 0;
const ip = () => `192.0.2.${++contadorIp}`;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
function ultimoToken() {
  const mensaje = smtp.correos.at(-1);
  assert.ok(mensaje.text && mensaje.html && mensaje.to === email);
  const token = /\/restablecer\/([a-f0-9]{64})/.exec(mensaje.text)?.[1];
  assert.ok(token, "correo con enlace de 32 bytes aleatorios");
  return token;
}

async function ejecutar(handler: typeof recuperar, body: unknown, direccion = ip()) {
  const tareas: Array<() => Promise<void>> = [];
  const req = new NextRequest("https://crm.prueba.test/api/auth/prueba", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": direccion }, body: JSON.stringify(body) });
  const respuesta = await workAsyncStorage.run({ afterContext: { after: (tarea: () => Promise<void>) => tareas.push(tarea) } } as never, () => workUnitAsyncStorage.run({ type: "request", phase: "action" } as never, () => handler(req)));
  const contenido = await respuesta.json();
  return { status: respuesta.status, contenido, terminar: async () => { for (const tarea of tareas) await tarea(); } };
}
async function solicitar(slug = slugA, correo = email, direccion = ip()) {
  const respuesta = await ejecutar(recuperar, { org: slug, email: correo }, direccion);
  assert.equal(respuesta.status, 200);
  assert.deepEqual(respuesta.contenido, { mensaje: MENSAJE_RECUPERAR });
  await respuesta.terminar();
  return respuesta;
}
async function cambiar(token: string, password = nueva) {
  const respuesta = await ejecutar(restablecer, { token, nueva: password });
  await respuesta.terminar();
  return respuesta;
}
async function invalido(token: string) {
  const respuesta = await cambiar(token);
  assert.equal(respuesta.status, 400);
  assert.deepEqual(respuesta.contenido, { error: ERROR_TOKEN });
}

try {
  const rol = await admin.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='crm_app'");
  assert.deepEqual(rol.rows[0], { rolsuper: false, rolbypassrls: false });
  const orgs = await admin.query("INSERT INTO orgs(nombre,slug) VALUES ('Org A <segura>',$1),('Org B',$2) RETURNING id", [slugA, slugB]);
  [orgA, orgB] = orgs.rows.map((fila) => BigInt(fila.id));
  const passwordHash = await bcrypt.hash("Anterior123!", 10);
  const usuarios = await admin.query("INSERT INTO usuarios(org_id,nombre,email,password_hash) VALUES ($1,'Usuario A',$3,$4),($2,'Usuario B',$3,$4) RETURNING id", [String(orgA), String(orgB), email, passwordHash]);
  [usuarioA, usuarioB] = usuarios.rows.map((fila) => BigInt(fila.id));

  const antes = smtp.correos.length;
  const inicio = performance.now();
  const respuesta = await ejecutar(recuperar, { org: slugA, email });
  const tiempoRespuesta = performance.now() - inicio;
  assert.equal(smtp.correos.length, antes, "no hay consulta de cuenta ni SMTP antes de responder");
  smtp.demorar(100);
  await respuesta.terminar();
  smtp.demorar(0);
  assert.equal(respuesta.status, 200);
  const token = ultimoToken();
  const fila = await admin.query("SELECT * FROM restablecimientos_password WHERE token_hash=$1", [hash(token)]);
  assert.equal(fila.rowCount, 1);
  assert.equal(fila.rows[0].usuario_id, String(usuarioA));
  assert.equal(new Date(fila.rows[0].vence_at).getTime() - new Date(fila.rows[0].created_at).getTime() < 3_601_000, true);
  assert.ok(new Date(fila.rows[0].vence_at).getTime() - new Date(fila.rows[0].created_at).getTime() > 3_599_000);
  assert.ok(!JSON.stringify(fila.rows).includes(token), "la BD solo conoce SHA-256");
  assert.ok(smtp.correos.at(-1).html.includes("Org A &lt;segura&gt;"));
  const corta = await cambiar(token, "corta");
  assert.equal(corta.status, 400);
  const cambiada = await cambiar(token);
  assert.equal(cambiada.status, 200);
  assert.deepEqual(cambiada.contenido, { ok: true });
  const usuario = await runWithOrg(orgA, () => db.usuario.findUniqueOrThrow({ where: { id: usuarioA } }));
  assert.ok(await bcrypt.compare(nueva, usuario.passwordHash));
  assert.equal(bcrypt.getRounds(usuario.passwordHash), 10);
  assert.ok(usuario.passwordCambiadaAt);
  assert.ok(smtp.correos.at(-1).subject.includes("tu contraseña fue cambiada"));
  assert.ok(!smtp.correos.at(-1).text.includes(token));
  await invalido(token);
  await invalido("invalido");
  await invalido(randomBytes(32).toString("hex"));

  await solicitar();
  const vencido = ultimoToken();
  await admin.query("UPDATE restablecimientos_password SET vence_at=now()-interval '1 minute' WHERE token_hash=$1", [hash(vencido)]);
  await invalido(vencido);
  await solicitar();
  const anterior = ultimoToken();
  await solicitar();
  const reciente = ultimoToken();
  await invalido(anterior);
  const simultaneos = await Promise.all([cambiar(reciente), cambiar(reciente)]);
  assert.deepEqual(simultaneos.map((r) => r.status).sort(), [200, 400], "solo un consumidor gana");

  const noEnvio = smtp.correos.length;
  const inexistente = await solicitar(slugA, `nadie-${sufijo}@example.test`);
  const orgInexistente = await solicitar(`ausente-${sufijo}`);
  assert.deepEqual(inexistente.contenido, respuesta.contenido);
  assert.deepEqual(orgInexistente.contenido, respuesta.contenido);
  await admin.query("UPDATE usuarios SET activo=false WHERE id=$1", [String(usuarioA)]);
  await solicitar();
  await admin.query("UPDATE usuarios SET activo=true WHERE id=$1", [String(usuarioA)]);
  await admin.query("UPDATE orgs SET activo=false WHERE id=$1", [String(orgB)]);
  await solicitar(slugB);
  assert.equal(smtp.correos.length, noEnvio);
  await admin.query("UPDATE orgs SET activo=true WHERE id=$1", [String(orgB)]);

  const antesLimite = smtp.correos.length;
  for (let n = 0; n < 7; n++) await solicitar(slugB);
  assert.equal(smtp.correos.length - antesLimite, 4, "cinco solicitudes por org+correo, incluida la hecha con la org inactiva");
  const ipFija = ip();
  const nuevasCuentas = await admin.query("INSERT INTO usuarios(org_id,nombre,email,password_hash) SELECT $1,'Límite','ip-' || n || '-' || $2 || '@example.test',$3 FROM generate_series(1,7) n RETURNING email", [String(orgB), sufijo, passwordHash]);
  const antesIp = smtp.correos.length;
  for (const cuenta of nuevasCuentas.rows) await solicitar(slugB, cuenta.email, ipFija);
  assert.equal(smtp.correos.length - antesIp, 5, "límite por IP aunque cambie la cuenta");

  const tokenB = await runWithOrg(orgB, () => db.restablecimientoPassword.findFirstOrThrow({ where: { usuarioId: usuarioB, usadoAt: null } }));
  assert.equal(await runWithOrg(orgA, () => db.restablecimientoPassword.findUnique({ where: { id: tokenB.id } })), null);
  assert.equal((await runWithOrg(orgA, () => db.restablecimientoPassword.updateMany({ where: { id: tokenB.id }, data: { usadoAt: new Date() } }))).count, 0);
  await assert.rejects(runWithOrg(orgA, () => db.restablecimientoPassword.create({ data: { usuarioId: usuarioB, tokenHash: randomBytes(32).toString("hex"), venceAt: new Date(Date.now() + 60_000) } })), "FK compuesta impide asociar un usuario de otra org");
  const usuarioIntacto = await runWithOrg(orgB, () => db.usuario.findUniqueOrThrow({ where: { id: usuarioB } }));
  assert.equal(usuarioIntacto.passwordHash, passwordHash);

  delete process.env.SMTP_HOST;
  assert.equal(correoConfigurado(), false);
  const sinSmtp = smtp.correos.length;
  assert.equal(await enviarCorreo({ para: email, asunto: "prueba", texto: "prueba", html: "prueba" }), false);
  await solicitar(slugA, "sin-smtp@example.test");
  assert.equal(smtp.correos.length, sinSmtp);
  process.env.SMTP_HOST = "smtp.invalid";
  smtp.fallar(true);
  assert.equal(await enviarCorreo({ para: email, asunto: "prueba", texto: "prueba", html: "prueba" }), false);
  smtp.fallar(false);
  assert.ok(!logs.join("\n").includes(token) && !logs.join("\n").includes(nueva) && !logs.join("\n").includes(email), "logs sin secretos ni datos personales");
  console.log(`OK · flujo completo, hash, bcrypt 10, vencimiento, uso único concurrente, respuesta idéntica, inactivos, límites, RLS y SMTP simulado. Respuesta inicial: ${tiempoRespuesta.toFixed(1)} ms.`);
} finally {
  logInfo.mock.restore();
  logError.mock.restore();
  if (orgA!) {
    await admin.query("DELETE FROM usuarios WHERE org_id IN ($1,$2)", [String(orgA), String(orgB!)]);
    await admin.query("DELETE FROM orgs WHERE id IN ($1,$2)", [String(orgA), String(orgB!)]);
  }
  await dbRaw.$disconnect();
  await admin.end();
  hooks.deregister();
}
