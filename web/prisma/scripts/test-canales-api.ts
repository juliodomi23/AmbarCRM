import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import https from "node:https";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { NextRequest } from "next/server";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { entregarWebhookApi, firmaApi, verificarFirmaApi, validarUrlCanalApi } from "../../src/lib/api-webhook";
import { crearCanalApi, editarCanalApi } from "../../src/lib/services/canales";
import { listarCanales } from "../../src/lib/services/config";
import { listarBots } from "../../src/lib/services/bots";
import { POST as entrada } from "../../src/app/api/canal-api/[canalId]/mensajes/route";
import { POST as responder } from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/messages/route";
import { GET as leerConversacion } from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/route";

assert.equal(new URL(process.env.DATABASE_URL!).port, "55450", "solo BD desechable");
for (const url of ["http://8.8.8.8", "https://localhost", "https://127.1", "https://[::ffff:127.0.0.1]", "https://10.0.0.1", "https://user:pass@example.com"]) assert.ok(validarUrlCanalApi(url));
const cuerpo = '{"content":"á"}';
const firma = `sha256=${createHmac("sha256", "secreto").update(`123.${cuerpo}`).digest("hex")}`;
assert.equal(firmaApi("secreto", "123", cuerpo), firma);
assert.ok(verificarFirmaApi("secreto", "123", cuerpo, firma));
assert.equal(verificarFirmaApi("secreto", "124", cuerpo, firma), false);
assert.equal(verificarFirmaApi("secreto", "123", cuerpo + " ", firma), false);
const esperas: number[] = [];
const entregas: string[] = [];
let intentos = 0;
const opciones = { resolver: async () => [{ address: "8.8.8.8", family: 4 }],
  enviar: async ({ headers, cuerpo }: { headers: Record<string, string>; cuerpo: string }) => {
    assert.ok(verificarFirmaApi("s", headers["X-Ambar-Timestamp"], cuerpo, headers["X-Ambar-Signature"]));
    entregas.push(headers["X-Ambar-Delivery"]);
    return ++intentos < 4 ? 503 : 200;
  }, esperar: async (ms: number) => { esperas.push(ms); } };
assert.equal((await entregarWebhookApi("https://8.8.8.8/hook", "s", { content: "hola" }, opciones)).ok, true);
assert.equal(intentos, 4); assert.deepEqual(esperas, [500, 1000, 2000]); assert.equal(new Set(entregas).size, 1);
assert.equal((await entregarWebhookApi("https://8.8.8.8", "s", {}, { ...opciones, resolver: async () => [{ address: "127.0.0.1", family: 4 }] })).ok, false);
assert.equal(intentos, 4, "DNS privado no llega al transporte");
assert.equal((await entregarWebhookApi("https://8.8.8.8", "s", {}, { ...opciones, enviar: async () => 302 })).ok, false, "no sigue redirecciones");

const orgs = await Promise.all(["a", "b"].map((letra) => dbRaw.org.create({ data: { nombre: `API ${letra}`, slug: `test-api-${letra}-${Date.now()}` } })));
const fetchOriginal = globalThis.fetch;
const requestOriginal = https.request;
let codigoSalida = 200;
const salidas: { headers: Record<string, string>; body: string }[] = [];
const dispatches: any[] = [];
globalThis.fetch = async (_url, init) => { dispatches.push(JSON.parse(String(init?.body))); return new Response("{}", { status: 200 }); };
https.request = ((_url: unknown, options: any, callback: any) => {
  const peticion = new EventEmitter() as any;
  peticion.destroy = (error: Error) => peticion.emit("error", error);
  peticion.end = (body: string) => {
    salidas.push({ headers: options.headers, body });
    queueMicrotask(() => { callback({ statusCode: codigoSalida, resume() {} }); peticion.emit("close"); });
  };
  return peticion;
}) as typeof https.request;
syncBuiltinESMExports();
try {
  const canales = await Promise.all(orgs.map((org) => runWithOrg(org.id, () => crearCanalApi("Prueba API", "https://8.8.8.8/hook"))));
  await assert.rejects(() => runWithOrg(orgs[0].id, () => crearCanalApi("Privado", "https://127.0.0.1")));
  const llamar = (i: number, clave: string, mensajeId: string) => entrada(new NextRequest(`https://crm.prueba.test/api/canal-api/${canales[i].id}/mensajes`, {
    method: "POST", headers: { "x-api-key": clave },
    body: JSON.stringify({ contacto: { id_externo: "cliente" }, mensaje: { id: mensajeId, tipo: "texto", contenido: "hola" } }),
  }), { params: Promise.resolve({ canalId: canales[i].id }) });
  assert.equal((await llamar(1, canales[0].apiKey, "cruzado")).status, 401);
  await runWithOrg(orgs[1].id, async () => { assert.equal(await db.mensaje.count(), 0); assert.equal(await db.contacto.count(), 0); });
  const token = randomBytes(24).toString("hex");
  await runWithOrg(orgs[0].id, () => db.bot.create({ data: { nombre: "Bot API", apiToken: token, webhookUrl: "https://8.8.8.8/bot", canalId: BigInt(canales[0].id), permisos: ["leer_perfil", "enviar_mensaje", "notas_internas"] } }));
  const respuestas = await Promise.all(Array.from({ length: 8 }, () => llamar(0, canales[0].apiKey, "id-unico")));
  const resultados = await Promise.all(respuestas.map((r) => r.json()));
  assert.equal(resultados.filter((r) => !r.duplicado).length, 1, "8 entradas simultáneas crean un mensaje");
  assert.equal(dispatches.length, 1, "el bot se invoca una sola vez");
  assert.equal(dispatches[0].sender.identifier, "cliente"); assert.equal(dispatches[0].sender.phone_number, null);
  const conv = await runWithOrg(orgs[0].id, () => db.conversacion.findFirstOrThrow());
  const perfil = await leerConversacion(new NextRequest("https://crm.prueba.test/api/v1/accounts/1/conversations/1", { headers: { api_access_token: token } }),
    { params: Promise.resolve({ accountId: "1", conversationId: String(conv.id) }) });
  const datosPerfil = await perfil!.json();
  assert.equal(datosPerfil.meta.sender.identifier, "cliente", "GET conserva la identidad externa usada por n8n");
  assert.equal(datosPerfil.meta.sender.phone_number, null);
  const postBot = (privado = false) => responder(new NextRequest("https://crm.prueba.test/api/v1/accounts/1/conversations/1/messages", {
    method: "POST", headers: { api_access_token: token }, body: JSON.stringify({ content: "respuesta", private: privado }),
  }), { params: Promise.resolve({ accountId: "1", conversationId: String(conv.id) }) });
  assert.equal((await postBot())!.status, 200);
  assert.equal(JSON.parse(salidas[0].body).receiver.identifier, "cliente");
  assert.ok(verificarFirmaApi(canales[0].secret, salidas[0].headers["X-Ambar-Timestamp"], salidas[0].body, salidas[0].headers["X-Ambar-Signature"]));
  const anteriores = salidas.length;
  assert.equal((await postBot(true))!.status, 200); assert.equal(salidas.length, anteriores, "nota privada no sale al canal");
  codigoSalida = 400;
  assert.equal((await postBot())!.status, 502);
  await runWithOrg(orgs[0].id, async () => {
    const fallido = await db.mensaje.findFirstOrThrow({ where: { status: "fallido" } });
    assert.match(fallido.errorDetalle!, /HTTP 400/);
    const listado = JSON.stringify(await listarCanales(), (_k, v) => typeof v === "bigint" ? String(v) : v);
    const bots = JSON.stringify(await listarBots(), (_k, v) => typeof v === "bigint" ? String(v) : v);
    assert.doesNotMatch(listado + bots, /apiKeyHash|secretEncrypted|tokenEncrypted/);
    const regeneradas = await editarCanalApi(BigInt(canales[0].id), { regenerar: true });
    assert.notEqual(regeneradas.apiKey, canales[0].apiKey);
  });
  assert.equal((await llamar(0, canales[0].apiKey, "revocada")).status, 401);
  console.log("OK · API: firma, SSRF, DNS privado, reintentos, idempotencia concurrente, bot sin teléfono, notas, fallo, secretos, regeneración y aislamiento");
} finally {
  globalThis.fetch = fetchOriginal; https.request = requestOriginal; syncBuiltinESMExports();
  // Los fixtures se quedan en la BD desechable, que se elimina al terminar la sesión.
  await dbRaw.$disconnect();
}
