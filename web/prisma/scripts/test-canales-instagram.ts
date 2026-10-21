import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire, syncBuiltinESMExports } from "node:module";
import https from "node:https";
import pg from "pg";
import { EventEmitter } from "node:events";
import { format } from "node:util";
import { NextRequest } from "next/server";

const require = createRequire(import.meta.url);
const { db, dbRaw, runWithOrg }: typeof import("../../src/lib/db") = require("../../src/lib/db.ts");
const { encryptMetaToken, decryptMetaToken }: typeof import("../../src/lib/meta/credentials") = require("../../src/lib/meta/credentials.ts");
const { makeInstagramProvider, normalizarInstagram, tipoEnvioInstagram, CAMPOS_INSTAGRAM }: typeof import("../../src/lib/channel/instagram") = require("../../src/lib/channel/instagram.ts");
const { getProvider }: typeof import("../../src/lib/channel") = require("../../src/lib/channel/index.ts");
const { guardarCanalInstagram }: typeof import("../../src/lib/services/canales") = require("../../src/lib/services/canales.ts");
const { listarCanales }: typeof import("../../src/lib/services/config") = require("../../src/lib/services/config.ts");
const { crearWebhookSaliente }: typeof import("../../src/lib/services/webhooks-salientes") = require("../../src/lib/services/webhooks-salientes.ts");
const { guardarRegla }: typeof import("../../src/lib/services/reglas-automatizacion") = require("../../src/lib/services/reglas-automatizacion.ts");
const { esperarReglas }: typeof import("../../src/lib/disparar-evento") = require("../../src/lib/disparar-evento.ts");
const { esperarWebhooks }: typeof import("../../src/lib/webhooks-salientes") = require("../../src/lib/webhooks-salientes.ts");
const { enviarRespuestaRegla }: typeof import("../../src/lib/services/automatizaciones-envio") = require("../../src/lib/services/automatizaciones-envio.ts");
const { actualizarConversacion }: typeof import("../../src/lib/services/conversacion-estado") = require("../../src/lib/services/conversacion-estado.ts");

const conexion = new URL(process.env.DATABASE_URL!);
assert.equal(conexion.port, "55450");
assert.ok(["localhost", "127.0.0.1"].includes(conexion.hostname));
process.env.META_APP_SECRET = "global-instagram-simulado";
process.env.META_HUMAN_AGENT_APROBADO = "true";
process.env.MESSENGER_VERIFY_TOKEN = "verify-instagram-simulado";
const auth = require("next-auth/next");
const originalAuth = auth.getServerSession;
const originalFetch = globalThis.fetch;
const originalHttps = https.request;
const originalConsole = { log: console.log, warn: console.warn, error: console.error };
const registros: string[] = [];
for (const nivel of ["log", "warn", "error"] as const) console[nivel] = (...args: unknown[]) => { registros.push(format(...args)); };
let sesion: { user: { id: string; orgId: string; rol: string } } | null = null;
auth.getServerSession = async () => sesion;
const rutasCanales: typeof import("../../src/app/api/canales/route") = require("../../src/app/api/canales/route.ts");
const rutasDetalle: typeof import("../../src/app/api/canales/[id]/route") = require("../../src/app/api/canales/[id]/route.ts");
function conSesion<T>(operacion: () => Promise<T>) {
  return sesion ? runWithOrg(BigInt(sesion.user.orgId), operacion) : operacion();
}
const canales = { POST: (...args: Parameters<typeof rutasCanales.POST>) => conSesion(() => rutasCanales.POST(...args)) };
const detalle = {
  PATCH: (...args: Parameters<typeof rutasDetalle.PATCH>) => conSesion(() => rutasDetalle.PATCH(...args)),
  DELETE: (...args: Parameters<typeof rutasDetalle.DELETE>) => conSesion(() => rutasDetalle.DELETE(...args)),
};
const entrada: typeof import("../../src/app/api/instagram/webhook/route") = require("../../src/app/api/instagram/webhook/route.ts");
const perfilBot: typeof import("../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/route") = require("../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/route.ts");
const respuestaBot: typeof import("../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/messages/route") = require("../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/messages/route.ts");
const marca = String(Date.now());
const token = `TOKEN-IG-PRIVADO-${marca}`;
const secreto = `APP-SECRET-IG-${marca}`;
const cuerpoPrivado = `CUERPO-META-PRIVADO-${marca}`;
const adminUrl = new URL(process.env.ADMIN_DATABASE_URL!);
assert.equal(adminUrl.port, "55450"); assert.ok(["localhost", "127.0.0.1"].includes(adminUrl.hostname));
const limpieza = new pg.Pool({ connectionString: adminUrl.href, max: 1 });
const orgs = await Promise.all(["a", "b"].map((l) => dbRaw.org.create({ data: { nombre: l, slug: `ig-${l}-${marca}` } })));
const cuentas = [`${marca}1`, `${marca}2`, `${marca}3`];
const respuestas: string[] = [];
const envios: any[] = [];
const entregas: any[] = [];
const llamadas: { url: string; method: string }[] = [];
let fallo: { status?: number; code?: number; red?: boolean; timeout?: boolean; sinConfirmar?: boolean; noJson?: boolean } | null = null;
let perfilFalla = true;
let secuencia = 0;
let esperarSuscripcion: (() => Promise<void>) | undefined;
const fallarGraph = () => {
  if (fallo?.red) throw new TypeError(cuerpoPrivado + token + secreto);
  if (fallo?.timeout) throw new DOMException(cuerpoPrivado, "TimeoutError");
  if (fallo?.noJson) return new Response(cuerpoPrivado, { status: 200 });
  if (fallo?.sinConfirmar) return Response.json({ success: false });
  return Response.json({ error: { code: fallo?.code ?? 200, message: cuerpoPrivado + token + secreto } }, { status: fallo?.status ?? 503 });
};
globalThis.fetch = async (input, init) => {
  const url = String(input);
  assert.ok(url.startsWith("https://graph.facebook.com/"), "solo Graph simulado");
  assert.ok(!new URL(url).searchParams.has("access_token"));
  assert.ok(new Headers(init?.headers).get("authorization")?.startsWith("Bearer "));
  llamadas.push({ url, method: init?.method ?? "GET" });
  if (url.endsWith("/subscribed_apps")) {
    if (init?.method === "POST") {
      assert.deepEqual(JSON.parse(String(init.body)).subscribed_fields, CAMPOS_INSTAGRAM);
      await esperarSuscripcion?.();
    }
    return fallo ? fallarGraph() : Response.json({ success: true });
  }
  if (url.endsWith("/me/messages")) {
    envios.push(JSON.parse(String(init?.body)));
    return fallo ? fallarGraph() : Response.json({ message_id: `ig-enviado-${++secuencia}` });
  }
  assert.equal(new URL(url).searchParams.get("fields"), "name,username,profile_pic");
  return perfilFalla ? Response.json({ error: { code: 10, message: cuerpoPrivado } }, { status: 403 })
    : Response.json({ name: "Nombre compartido", profile_pic: "https://8.8.8.8/avatar.png" });
};
https.request = ((_url: unknown, _opciones: unknown, callback: (res: unknown) => void) => {
  const req = new EventEmitter() as EventEmitter & { end: (body: string) => void; destroy: (e: Error) => void };
  req.destroy = (e) => req.emit("error", e);
  req.end = (body) => { entregas.push(JSON.parse(body)); queueMicrotask(() => { callback({ statusCode: 200, resume() {} }); req.emit("close"); }); };
  return req;
}) as typeof https.request;
syncBuiltinESMExports();
const observar = async (res: Response | undefined) => { assert.ok(res); respuestas.push(await res.clone().text()); return res; };
const request = (method: string, body?: unknown) => new NextRequest("https://crm.prueba.test/api/canales", {
  method, ...(body == null ? {} : { body: JSON.stringify(body) }), headers: { "Content-Type": "application/json" },
});
const props = (id: string | bigint) => ({ params: Promise.resolve({ id: String(id) }) });
const datosAlta = (cuenta: string, extras: object = {}) => ({ proveedor: "instagram", nombre: "Instagram de prueba", instagram_id: cuenta,
  page_id: `${cuenta}9`, page_access_token: token, app_id: "123", app_secret: secreto, ...extras });
const firmar = (raw: string, secret = secreto) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
const postRaw = (raw: string, secret = secreto, signature = firmar(raw, secret)) => entrada.POST(new NextRequest("https://crm.prueba.test/api/instagram/webhook", {
  method: "POST", body: raw, headers: { "x-hub-signature-256": signature },
}));
const evento = (mid: string, extra: object = {}, sender = "igsid-cliente") => ({ sender: { id: sender }, recipient: { id: cuentas[0] }, timestamp: Date.now(), message: { mid, text: "Hola", ...extra } });
const webhook = (mid: string, cuenta = cuentas[0], secret = secreto, extra: object = {}) => postRaw(JSON.stringify({ object: "instagram", entry: [{ id: cuenta, messaging: [evento(mid, extra)] }] }), secret);
const esperar = async () => { await esperarReglas(); await esperarWebhooks(); };
const admin = (i: number, rol = "admin") => { sesion = { user: { id: "1001", orgId: String(orgs[i].id), rol } }; };

try {
  for (const org of orgs) await runWithOrg(org.id, () => db.ajustes.create({ data: { crearLeadAuto: false } }));
  assert.equal((await observar(await canales.POST(request("POST", datosAlta(cuentas[0]))))).status, 401);
  admin(0, "agente");
  assert.equal((await observar(await canales.POST(request("POST", datosAlta(cuentas[0]))))).status, 403);
  admin(0);
  for (const invalida of [{ app_secret: "" }, { app_id: "incorrecto" }, { page_access_token: " " }, { instagram_id: "abc" }, { quitar_app: true }]) {
    assert.equal((await observar(await canales.POST(request("POST", datosAlta(cuentas[0], invalida))))).status, 400);
  }
  const alta = await observar(await canales.POST(request("POST", datosAlta(cuentas[0]))));
  assert.equal(alta.status, 201);
  const a = await alta.json();
  admin(1);
  const previoDuplicado = llamadas.length;
  assert.equal((await observar(await canales.POST(request("POST", datosAlta(cuentas[0]))))).status, 409);
  assert.equal(llamadas.length, previoDuplicado, "duplicado conocido no llama a Graph");
  const altaB = await observar(await canales.POST(request("POST", datosAlta(cuentas[1], { app_secret: secreto + "-b" }))));
  assert.equal(altaB.status, 201); const b = await altaB.json();
  const canalA = await runWithOrg(orgs[0].id, () => db.canalWhatsapp.findUniqueOrThrow({ where: { id: BigInt(a.id) } }));
  const configA = canalA.config as Record<string, string>;
  assert.equal(decryptMetaToken(configA.tokenEncrypted), token);
  assert.equal(decryptMetaToken(configA.appSecretEncrypted), secreto);
  assert.ok(configA.tokenEncrypted.startsWith("encv1:") && configA.appSecretEncrypted.startsWith("encv1:"));
  assert.equal(getProvider("instagram", configA).nombre, "instagram");
  await runWithOrg(orgs[0].id, async () => {
    const etiqueta = await db.etiqueta.create({ data: { nombre: "Instagram entrante" } });
    await guardarRegla(orgs[0].id, { nombre: "Solo Instagram", evento: "mensaje.recibido", condiciones: [{ tipo: "canal", valor: "instagram" }], acciones: [{ tipo: "agregar_etiqueta", id: String(etiqueta.id) }] });
    await crearWebhookSaliente(orgs[0].id, { url: "https://8.8.8.8/ig", eventos: ["contacto.creado", "conversacion.creada", "mensaje.recibido", "conversacion.estado_cambiado"] });
  });
  const get = await entrada.GET(new NextRequest("https://crm.prueba.test/api/instagram/webhook?hub.mode=subscribe&hub.verify_token=verify-instagram-simulado&hub.challenge=ok-ig"));
  assert.equal(get.status, 200); assert.equal(await get.text(), "ok-ig");
  assert.equal((await entrada.GET(new NextRequest("https://crm.prueba.test/api/instagram/webhook?hub.mode=subscribe&hub.verify_token=mal&hub.challenge=x"))).status, 403);
  assert.equal((await postRaw("{mal", "x", "sha256=mal")).status, 401);
  assert.equal((await postRaw("{mal", process.env.META_APP_SECRET)).status, 400);
  assert.equal((await webhook("invalida", cuentas[0], "incorrecto")).status, 401);
  assert.equal((await webhook("global-no-autoriza-propio", cuentas[0], process.env.META_APP_SECRET)).status, 401);
  const sinFirma = JSON.stringify({ object: "instagram", entry: [{ id: cuentas[0], messaging: [] }] });
  assert.equal((await entrada.POST(new NextRequest("https://crm.prueba.test/api/instagram/webhook", { method: "POST", body: sinFirma }))).status, 401);
  assert.equal((await webhook("ig-1")).status, 200);
  await esperar();
  const conv = await runWithOrg(orgs[0].id, async () => {
    assert.equal(await db.contacto.count(), 1);
    const contacto = await db.contacto.findFirstOrThrow();
    assert.equal(contacto.nombre, "igsid-cliente", "perfil denegado no pierde entrada");
    assert.equal(contacto.telefono, null);
    assert.equal(await db.contactoEtiqueta.count(), 1, "regla de canal Instagram ejecutada");
    return db.conversacion.findFirstOrThrow();
  });
  assert.ok(entregas.length >= 3);
  assert.ok(entregas.every((e) => e.datos.canal === "instagram"), "payload saliente incluye proveedor");
  const antesDuplicado = entregas.length;
  await Promise.all([webhook("ig-1"), webhook("ig-1")]); await esperar();
  assert.equal(entregas.length, antesDuplicado);
  await Promise.all([webhook("ig-concurrente"), webhook("ig-concurrente")]); await esperar();
  await runWithOrg(orgs[0].id, async () => {
    assert.equal(await db.mensaje.count({ where: { waMessageId: "ig-concurrente" } }), 1);
    assert.equal(await db.contacto.count(), 1);
  });
  assert.equal((await webhook("ig-b", cuentas[1], secreto + "-b")).status, 200);
  await runWithOrg(orgs[1].id, async () => { assert.equal(await db.contacto.count(), 1); assert.equal(await db.mensaje.count(), 1); assert.equal(await db.canalWhatsapp.findUnique({ where: { id: BigInt(a.id) } }), null); });
  const mixto = JSON.stringify({ object: "instagram", entry: cuentas.slice(0, 2).map((id) => ({ id, messaging: [evento("mixto")] })) });
  assert.equal((await postRaw(mixto)).status, 200); await esperar();
  await runWithOrg(orgs[1].id, async () => assert.equal(await db.mensaje.count(), 1, "firma A no autoriza B"));
  await runWithOrg(orgs[0].id, () => db.canalWhatsapp.update({ where: { id: BigInt(a.id) }, data: { config: { ...configA, appSecretEncrypted: "encv1:roto" } } }));
  assert.equal((await webhook("cifrado-roto", cuentas[0], process.env.META_APP_SECRET)).status, 401);
  await runWithOrg(orgs[0].id, () => db.canalWhatsapp.update({ where: { id: BigInt(a.id) }, data: { config: configA } }));
  perfilFalla = false;
  const global = await runWithOrg(orgs[0].id, () => db.canalWhatsapp.create({ data: { nombre: "Respaldo global", proveedor: "instagram", config: { instagramId: cuentas[2], pageId: cuentas[2], tokenEncrypted: encryptMetaToken(token) } } }));
  assert.equal((await webhook("global-ok", cuentas[2], process.env.META_APP_SECRET)).status, 200);
  assert.equal((await webhook("global-mal", cuentas[2], "incorrecto")).status, 401);
  assert.equal((await webhook("desconocida", `${marca}999`, "incorrecto")).status, 200);
  assert.equal((await postRaw(JSON.stringify({ object: "instagram", entry: [{ id: cuentas[0], messaging: [{ read: { watermark: Date.now() } }] }] }))).status, 200);
  await runWithOrg(orgs[0].id, async () => assert.equal(await db.contacto.count(), 2, "IGSID idéntico en otro canal no fusiona contactos"));
  await webhook("reel", cuentas[0], secreto, { text: undefined, attachments: [{ type: "ig_reel", payload: { url: "https://8.8.8.8/reel" } }] });
  await webhook("vacio", cuentas[0], secreto, { text: undefined });
  await webhook("imagen", cuentas[0], secreto, { attachments: [{ type: "image", payload: { url: "https://8.8.8.8/foto.png" } }, { type: "story", payload: {} }] });
  await esperar();
  await runWithOrg(orgs[0].id, async () => {
    const reel = await db.mensaje.findFirstOrThrow({ where: { waMessageId: "reel" } }); assert.equal(reel.tipo, "texto"); assert.match(reel.contenido!, /Adjunto de Instagram no compatible/);
    assert.equal((await db.mensaje.findFirstOrThrow({ where: { waMessageId: "imagen" } })).tipo, "imagen");
    assert.match((await db.mensaje.findFirstOrThrow({ where: { waMessageId: "vacio" } })).contenido!, /sin contenido compatible/);
  });
  assert.deepEqual(normalizarInstagram({ entry: null }), []);
  assert.equal(normalizarInstagram({ entry: [null, { messaging: [null] }] }).length, 0);
  const ahora = Date.now();
  const edad = (horas: number, humano = false) => ({ ultimoEntranteAt: new Date(ahora - horas * 3600000), humano });
  assert.deepEqual(tipoEnvioInstagram(edad(23), ahora), { messaging_type: "RESPONSE" });
  assert.equal(tipoEnvioInstagram(edad(24), ahora), null);
  assert.equal(tipoEnvioInstagram(edad(24, true), ahora, false), null);
  assert.deepEqual(tipoEnvioInstagram(edad(24, true), ahora), { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
  assert.equal(tipoEnvioInstagram(edad(168, true), ahora), null);
  assert.equal(tipoEnvioInstagram(), null);
  assert.equal(tipoEnvioInstagram({ ultimoEntranteAt: new Date(ahora + 61000) }, ahora), null);
  const provider = makeInstagramProvider(configA);
  await runWithOrg(orgs[0].id, async () => {
    assert.equal((await provider.enviarTexto("igsid-cliente", "Respuesta", edad(1))).ok, true);
    assert.equal(envios.at(-1).recipient.id, "igsid-cliente");
    assert.equal((await provider.enviarMedia("igsid-cliente", "https://8.8.8.8/foto.png", "imagen", "Texto", undefined, edad(1))).ok, true);
    assert.equal(envios.at(-1).message.attachment.type, "image");
    const antes = llamadas.length;
    assert.equal((await provider.enviarTexto("igsid-cliente", "x".repeat(1001), edad(1))).ok, false);
    assert.equal((await provider.enviarTexto("igsid-cliente", "Sin ventana", edad(25))).ok, false);
    assert.equal((await provider.enviarTexto("igsid-cliente", "Muy tarde", edad(168, true))).ok, false);
    assert.equal((await provider.enviarMedia("igsid-cliente", "http://127.0.0.1/a", "imagen", undefined, undefined, edad(1))).ok, false);
    assert.equal(llamadas.length, antes);
    assert.equal((await provider.enviarTexto("igsid-cliente", "Asesor", edad(25, true))).ok, true);
    assert.equal(envios.at(-1).tag, "HUMAN_AGENT");
    const plantilla = await db.plantillaMensaje.create({ data: { nombre: "Respuesta", contenido: "Hola" } });
    await db.conversacion.update({ where: { id: conv.id }, data: { ultimoEntranteAt: edad(25).ultimoEntranteAt } });
    const antesRegla = llamadas.length;
    assert.equal(await enviarRespuestaRegla(orgs[0].id, conv.id, plantilla.id), "omitida_ventana");
    assert.equal(llamadas.length, antesRegla);
    await db.bot.create({ data: { nombre: "Bot IG", apiToken: `bot-ig-${marca}`, canalId: BigInt(a.id), permisos: ["leer_perfil", "enviar_mensaje"], webhookUrl: "https://8.8.8.8/bot" } });
    const hook = await db.webhookSaliente.findFirstOrThrow();
    await guardarRegla(orgs[0].id, { nombre: "Webhook Instagram", evento: "conversacion.estado_cambiado", condiciones: [{ tipo: "canal", valor: "instagram" }], acciones: [{ tipo: "enviar_webhook", id: String(hook.id) }] });
    await actualizarConversacion(orgs[0].id, conv.id, { estado: "pendiente" }); await esperar();
    assert.ok(entregas.filter((e) => e.evento === "conversacion.estado_cambiado").length >= 2);
    assert.ok(entregas.every((e) => e.datos.canal === "instagram"));
  });
  const botProps = { params: Promise.resolve({ accountId: "1", conversationId: String(conv.id) }) };
  const botReq = (method = "GET") => new NextRequest("https://crm.prueba.test/api/v1/accounts/1/conversations/1", { method, headers: { api_access_token: `bot-ig-${marca}` }, ...(method === "POST" ? { body: JSON.stringify({ content: "Desde bot" }) } : {}) });
  const perfil = await observar(await perfilBot.GET(botReq(), botProps));
  assert.equal(perfil.status, 200); const datosPerfil = await perfil.json(); assert.equal(datosPerfil.canal, "instagram"); assert.equal(datosPerfil.meta.sender.identifier, "igsid-cliente");
  assert.equal((await observar(await respuestaBot.POST(botReq("POST"), botProps))).status, 502, "bot no usa Human Agent");
  await runWithOrg(orgs[0].id, async () => {
    for (const caso of [{ status: 503, code: 190 }, { status: 429, code: 190 }, { red: true }]) {
      fallo = caso;
      assert.equal((await provider.enviarTexto("igsid-cliente", "Respuesta", edad(1))).ok, false);
      assert.equal((await db.canalWhatsapp.findUniqueOrThrow({ where: { id: BigInt(a.id) } })).estado, "conectado");
    }
    fallo = { status: 400, code: 190 };
    assert.equal((await provider.enviarTexto("igsid-cliente", "Respuesta", edad(1))).ok, false);
    assert.equal((await db.canalWhatsapp.findUniqueOrThrow({ where: { id: BigInt(a.id) } })).estado, "desconectado");
  });
  fallo = null; admin(0);
  const editada = await observar(await detalle.PATCH(request("PATCH", { nombre: "Instagram editado", app_secret: secreto + "-nuevo" }), props(a.id)));
  assert.equal(editada.status, 200);
  assert.equal((await webhook("secreto-antiguo")).status, 401);
  assert.equal((await webhook("secreto-nuevo", cuentas[0], secreto + "-nuevo")).status, 200); await esperar();
  await runWithOrg(orgs[0].id, async () => {
    const c = await db.canalWhatsapp.findUniqueOrThrow({ where: { id: BigInt(a.id) } });
    assert.equal((c.config as any).tokenEncrypted, configA.tokenEncrypted, "editar conserva token no reemplazado");
    assert.equal(decryptMetaToken((c.config as any).appSecretEncrypted), secreto + "-nuevo");
  });
  assert.equal((await observar(await detalle.PATCH(request("PATCH", { app_id: false }), props(a.id)))).status, 400);
  const nuevaCuenta = cuentas[0] + "4";
  assert.equal((await observar(await detalle.PATCH(request("PATCH", { instagram_id: nuevaCuenta }), props(a.id)))).status, 200);
  await runWithOrg(orgs[0].id, async () => {
    const canal = await db.canalWhatsapp.findUniqueOrThrow({ where: { id: BigInt(a.id) } });
    assert.equal(canal.instancia, nuevaCuenta);
    assert.equal((canal.config as any).instagramId, nuevaCuenta);
  });
  assert.equal((await webhook("cuenta-editada", nuevaCuenta, secreto + "-nuevo")).status, 200); await esperar();
  assert.equal((await observar(await detalle.PATCH(request("PATCH", { instagram_id: cuentas[0] }), props(a.id)))).status, 200);
  let suscripciones = 0; let liberar!: () => void;
  const ambas = new Promise<void>((resolve) => { liberar = resolve; });
  esperarSuscripcion = async () => { if (++suscripciones === 2) liberar(); await ambas; };
  const carrera = await Promise.allSettled(orgs.map((org) => runWithOrg(org.id, () => guardarCanalInstagram(datosAlta(`${marca}77`)))));
  esperarSuscripcion = undefined;
  assert.equal(carrera.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(carrera.some((r) => r.status === "rejected" && r.reason.status === 409));

  const fixtureRetiro = () => runWithOrg(orgs[0].id, async () => {
    const idRetiro = `${marca}88${++secuencia}`;
    const canal = await db.canalWhatsapp.create({ data: { nombre: "Retiro IG", proveedor: "instagram", config: { ...configA, instagramId: idRetiro, pageId: idRetiro } } });
    const contacto = await db.contacto.create({ data: { nombre: "Historial", canalId: canal.id, identificadorExterno: "historial" } });
    const conversacion = await db.conversacion.create({ data: { contactoId: contacto.id, canalId: canal.id } });
    const mensaje = await db.mensaje.create({ data: { conversacionId: conversacion.id, direccion: "entrante", tipo: "texto", contenido: "Historial" } });
    return { canal, conversacion, mensaje };
  });
  const retiro = async (id: bigint, body: object = {}) => observar(await detalle.DELETE(request("DELETE", body), props(id)));
  const temporal = await fixtureRetiro();
  const antesPermisos = llamadas.length;
  sesion = null; assert.equal((await retiro(temporal.canal.id, { forzar: true })).status, 401);
  admin(0, "agente"); assert.equal((await retiro(temporal.canal.id, { forzar: true })).status, 403);
  admin(1); assert.equal((await retiro(temporal.canal.id, { forzar: true, borrarDatos: true })).status, 404);
  assert.equal((await observar(await detalle.PATCH(request("PATCH", { nombre: "Ajeno" }), props(a.id)))).status, 404);
  assert.equal(llamadas.length, antesPermisos);
  admin(0);
  assert.equal((await retiro(temporal.canal.id)).status, 200);
  await runWithOrg(orgs[0].id, async () => assert.equal((await db.conversacion.findUniqueOrThrow({ where: { id: temporal.conversacion.id } })).canalId, null));
  for (const caso of [{ status: 400, code: 190 }, { status: 404 }, { status: 400, code: 803 }]) {
    const f = await fixtureRetiro(); fallo = caso;
    const res = await retiro(f.canal.id); assert.equal(res.status, 200); assert.equal((await res.json()).desuscrito, false);
  }
  const fallosTemporales = [{ status: 503 }, { status: 500, code: 190 }, { status: 429, code: 190 }, { red: true }, { timeout: true }, { status: 403, code: 200 }, { status: 400, code: 100 }, { sinConfirmar: true }, { noJson: true }];
  for (const caso of fallosTemporales) for (const borrarDatos of [false, true]) {
    const f = await fixtureRetiro(); fallo = caso;
    const res = await retiro(f.canal.id, { borrarDatos }); assert.equal(res.status, 502);
    await runWithOrg(orgs[0].id, async () => {
      assert.ok(await db.canalWhatsapp.findUnique({ where: { id: f.canal.id } }));
      assert.ok(await db.mensaje.findUnique({ where: { id: f.mensaje.id } }));
    });
    const forzado = await retiro(f.canal.id, { forzar: true, borrarDatos }); assert.equal(forzado.status, 200);
    const data = await forzado.json(); assert.equal(data.forzado, true); assert.equal(data.desuscrito, false);
    await runWithOrg(orgs[0].id, async () => {
      assert.equal(await db.canalWhatsapp.findUnique({ where: { id: f.canal.id } }), null);
      assert.equal(!!await db.mensaje.findUnique({ where: { id: f.mensaje.id } }), !borrarDatos);
    });
  }
  const estricto = await fixtureRetiro(); fallo = { status: 503 };
  for (const forzar of [false, "true", 1, null]) assert.equal((await retiro(estricto.canal.id, { forzar })).status, 502);
  fallo = null;
  const normal = await retiro(estricto.canal.id, { forzar: true, borrarDatos: true }); assert.equal(normal.status, 200); assert.equal((await normal.json()).desuscrito, true);
  fallo = { status: 403 };
  assert.equal((await observar(await canales.POST(request("POST", datosAlta(`${marca}9999`))))).status, 424);
  fallo = null;
  await esperar();
  const serializar = (v: unknown) => JSON.stringify(v, (_k, value) => typeof value === "bigint" ? String(value) : value);
  const publico = await runWithOrg(orgs[0].id, async () => serializar({ canales: await listarCanales(), eventos: await db.evento.findMany(), auditoria: await db.auditoriaBot.findMany(), ejecuciones: await db.ejecucionRegla.findMany(), errores: await db.mensaje.findMany({ select: { errorDetalle: true } }) }));
  const todo = respuestas.join("\n") + publico + serializar(registros);
  for (const privado of [token, secreto, cuerpoPrivado, configA.tokenEncrypted, configA.appSecretEncrypted, "encv1:"]) assert.ok(!todo.includes(privado), "secretos y cuerpos de Meta no salen en respuestas ni bitácoras");
  assert.ok(global.id && b.id);
} finally {
  await esperar();
  globalThis.fetch = originalFetch; https.request = originalHttps; syncBuiltinESMExports(); auth.getServerSession = originalAuth;
  Object.assign(console, originalConsole);
  for (const org of orgs) {
    await limpieza.query("DELETE FROM auditoria_bot WHERE org_id=$1", [String(org.id)]);
    await runWithOrg(org.id, async () => {
      await db.ejecucionRegla.deleteMany(); await db.reglaAutomatizacion.deleteMany(); await db.webhookSaliente.deleteMany();
      await db.bot.deleteMany(); await db.contactoEtiqueta.deleteMany();
      await db.mensaje.deleteMany(); await db.conversacion.deleteMany(); await db.contacto.deleteMany(); await db.canalWhatsapp.deleteMany();
      await db.plantillaMensaje.deleteMany(); await db.etiqueta.deleteMany(); await db.ajustes.deleteMany();
    });
    await dbRaw.org.delete({ where: { id: org.id } });
  }
  await limpieza.end(); await dbRaw.$disconnect();
}
console.log("OK · Instagram simulado: firmas propia/global, RLS, identidad, idempotencia concurrente, adjuntos conservados, ventanas 24 h/7 días, media, cifrado, 409 concurrente, bot y automatización, desconexión y 18 retiros forzados, permisos y privacidad");

