import assert from "node:assert/strict";
import { createRequire, syncBuiltinESMExports } from "node:module";
import https from "node:https";
import { EventEmitter } from "node:events";
import { NextRequest } from "next/server";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { entregarWebhookApi, verificarFirmaApi, validarUrlCanalApi } from "../../src/lib/api-webhook";
import { entregarEvento, emitirEvento, esperarWebhooks } from "../../src/lib/webhooks-salientes";
import { crearWebhookSaliente } from "../../src/lib/services/webhooks-salientes";
import { decryptMetaToken } from "../../src/lib/meta/credentials";

assert.equal(new URL(process.env.DATABASE_URL!).port, "55450");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname));
const require = createRequire(import.meta.url);
const auth = require("next-auth/next");
const originalAuth = auth.getServerSession;
let sesion: { user: { id: string; orgId: string; rol: string } } | null = null;
auth.getServerSession = async () => sesion;
const rutas: typeof import("../../src/app/api/webhooks-salientes/route") = require("../../src/app/api/webhooks-salientes/route.ts");
const detalle: typeof import("../../src/app/api/webhooks-salientes/[id]/route") = require("../../src/app/api/webhooks-salientes/[id]/route.ts");
const probar: typeof import("../../src/app/api/webhooks-salientes/[id]/probar/route") = require("../../src/app/api/webhooks-salientes/[id]/probar/route.ts");
const empresas = await Promise.all(["a", "b"].map((l) => dbRaw.org.create({ data: { nombre: l, slug: `hooks-${l}-${Date.now()}` } })));
const requestOriginal = https.request;
let status = 200;
const entregas: { headers: Record<string, string>; cuerpo: string }[] = [];
https.request = ((_url: unknown, options: { headers: Record<string, string> }, callback: (res: unknown) => void) => {
  const req = new EventEmitter() as EventEmitter & { end: (body: string) => void; destroy: (e: Error) => void };
  req.destroy = (e) => req.emit("error", e);
  req.end = (cuerpo) => {
    entregas.push({ headers: options.headers, cuerpo });
    queueMicrotask(() => { callback({ statusCode: status, resume() {} }); req.emit("close"); });
  };
  return req;
}) as typeof https.request;
syncBuiltinESMExports();
const opciones = { resolver: async () => [{ address: "8.8.8.8", family: 4 }], esperar: async () => {} };
const peticion = (method = "GET", body?: unknown) => new NextRequest("http://127.0.0.1/api/webhooks-salientes", {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: { "Content-Type": "application/json" },
});
const datos = { url: "https://8.8.8.8/webhook", eventos: ["mensaje.recibido"] };
try {
  assert.equal((await rutas.GET(peticion())).status, 401);
  sesion = { user: { id: "1", orgId: String(empresas[0].id), rol: "agente" } };
  assert.equal((await rutas.POST(peticion("POST", datos))).status, 403);
  sesion.user.rol = "admin";
  for (const url of ["http://8.8.8.8", "https://127.0.0.1", "https://10.0.0.1", "https://[::1]"]) {
    assert.ok(validarUrlCanalApi(url));
    assert.equal((await rutas.POST(peticion("POST", { ...datos, url }))).status, 400);
  }
  const creada = await rutas.POST(peticion("POST", datos));
  assert.equal(creada.status, 201);
  const webhook = await creada.json();
  assert.equal(webhook.secreto.length, 64);
  await runWithOrg(empresas[0].id, async () => {
    const fila = await db.webhookSaliente.findUniqueOrThrow({ where: { id: BigInt(webhook.id) } });
    assert.ok(fila.secreto.startsWith("encv1:")); assert.notEqual(fila.secreto, webhook.secreto);
    assert.equal(decryptMetaToken(fila.secreto), webhook.secreto);
    await crearWebhookSaliente(empresas[0].id, { ...datos, eventos: ["contacto.creado"] });
  });
  await runWithOrg(empresas[1].id, () => crearWebhookSaliente(empresas[1].id, datos));
  const resultado = await entregarEvento(empresas[0].id, "mensaje.recibido", { id: "1" }, opciones);
  assert.equal(resultado.length, 1); assert.equal(entregas.length, 1);
  const envio = entregas[0];
  assert.ok(verificarFirmaApi(webhook.secreto, envio.headers["X-Ambar-Timestamp"], envio.cuerpo, envio.headers["X-Ambar-Signature"]));
  assert.equal(JSON.parse(envio.cuerpo).empresa, String(empresas[0].id));
  assert.equal(JSON.parse(envio.cuerpo).evento, "mensaje.recibido");
  assert.ok(!envio.cuerpo.includes(webhook.secreto));
  status = 400;
  assert.equal((await entregarEvento(empresas[0].id, "mensaje.recibido", { id: "2" }, opciones))[0].ok, false);
  assert.equal(entregas.length, 2, "4xx no reintenta");
  status = 503;
  await entregarEvento(empresas[0].id, "mensaje.recibido", { id: "3" }, opciones);
  assert.equal(entregas.length, 6, "5xx hace cuatro intentos");
  const llamadas = entregas.length;
  assert.equal((await entregarWebhookApi(datos.url, "s", {}, { ...opciones, resolver: async () => [{ address: "10.0.0.2", family: 4 }] })).ok, false);
  assert.equal(entregas.length, llamadas, "DNS privado nunca toca transporte");
  status = 400;
  for (let i = 0; i < 18; i++) await entregarEvento(empresas[0].id, "mensaje.recibido", { id: "4" }, opciones);
  await runWithOrg(empresas[0].id, async () => {
    const fila = await db.webhookSaliente.findUniqueOrThrow({ where: { id: BigInt(webhook.id) } });
    assert.equal(fila.fallosSeguidos, 20); assert.equal(fila.activo, false);
    assert.equal(fila.ultimoError, "No se pudo entregar el webhook");
  });
  assert.equal((await entregarEvento(empresas[0].id, "mensaje.recibido", { id: "5" }, opciones)).length, 0);
  const props = { params: Promise.resolve({ id: webhook.id }) };
  const posterior = await detalle.PATCH(peticion("PATCH", { activo: true }), props);
  assert.ok(!(await posterior.text()).includes(webhook.secreto));
  status = 400;
  const operacion = { confirmada: true };
  emitirEvento(empresas[0].id, "mensaje.recibido", { id: "6" });
  assert.ok(operacion.confirmada); await esperarWebhooks();
  const prueba = await probar.POST(peticion("POST"), props);
  assert.equal(prueba.status, 200); assert.equal((await prueba.json()).ok, false);
  assert.equal(JSON.parse(entregas.at(-1)!.cuerpo).evento, "prueba");
  const lista = await rutas.GET(peticion());
  const texto = await lista.text(); assert.ok(!texto.includes(webhook.secreto)); assert.ok(!texto.includes("encv1:"));
  assert.ok(!texto.includes('"secreto"'));
  sesion.user.orgId = String(empresas[1].id);
  assert.equal((await detalle.PATCH(peticion("PATCH", { activo: false }), props)).status, 404);
  assert.equal((await detalle.DELETE(peticion("DELETE"), props)).status, 404);
  assert.equal((await probar.POST(peticion("POST"), props)).status, 404);
  await runWithOrg(empresas[0].id, async () => {
    await db.webhookSaliente.deleteMany();
    // El patrón ingenuo lee el mismo cupo antes de que cualquiera escriba.
    const cupos = await Promise.all(Array.from({ length: 12 }, () => db.webhookSaliente.count()));
    await Promise.all(cupos.map((n) => n < 10 ? db.webhookSaliente.create({ data: { ...datos, secreto: "simulado" } }) : null));
    assert.equal(await db.webhookSaliente.count(), 12, "sin bloqueo excede el límite");
    await db.webhookSaliente.deleteMany();
    const altas = await Promise.allSettled(Array.from({ length: 12 }, () => crearWebhookSaliente(empresas[0].id, datos)));
    assert.equal(altas.filter((r) => r.status === "fulfilled").length, 10);
    assert.equal(await db.webhookSaliente.count(), 10, "con bloqueo respeta el límite");
  });
  console.log("webhooks: firma, suscripción, RLS, reintentos, privacidad, permisos y límite concurrente OK (sin bloqueo 12; con bloqueo 10)");
} finally {
  await esperarWebhooks(); https.request = requestOriginal; syncBuiltinESMExports(); auth.getServerSession = originalAuth;
  for (const empresa of empresas) {
    await runWithOrg(empresa.id, () => db.webhookSaliente.deleteMany());
    await dbRaw.org.delete({ where: { id: empresa.id } });
  }
  await dbRaw.$disconnect();
}
