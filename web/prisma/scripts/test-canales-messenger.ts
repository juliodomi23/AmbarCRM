import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { guardarCanalMessenger } from "../../src/lib/services/canales";
import { CAMPOS_MESSENGER, makeMessengerProvider, tipoEnvioMessenger } from "../../src/lib/channel/messenger";
import { GET, POST } from "../../src/app/api/messenger/webhook/route";
import { POST as respuestaBot } from "../../src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/messages/route";
import { urlMediaPublica, firmaMediaValida } from "../../src/lib/channel/media-publica";
import { listarCanales } from "../../src/lib/services/config";
import { decryptMetaToken } from "../../src/lib/meta/credentials";

assert.equal(new URL(process.env.DATABASE_URL!).port, "55450");
process.env.META_APP_SECRET = "secreto-meta-de-pruebas";
process.env.META_APP_ID = "123";
process.env.MESSENGER_VERIFY_TOKEN = "verify-messenger";
const fetchOriginal = globalThis.fetch;
let tokenInvalido = false;
const envios: any[] = [];
const suscripciones: any[] = [];
let siguiente = 0;
let llamadasGraph = 0;
globalThis.fetch = async (url, init) => {
  llamadasGraph++;
  const direccion = String(url);
  assert.ok(direccion.startsWith("https://graph.facebook.com/"), `no debe llamar a servicios reales: ${direccion}`);
  if (direccion.endsWith("/subscribed_apps")) {
    suscripciones.push(JSON.parse(String(init?.body)));
    return Response.json({ success: true });
  }
  if (direccion.endsWith("/me/messages")) {
    envios.push(JSON.parse(String(init?.body)));
    if (tokenInvalido) return Response.json({ error: { code: 190, message: "Error validating access token: The session has been invalidated" } }, { status: 400 });
    return Response.json({ message_id: `salida-${++siguiente}` });
  }
  return Response.json({ error: { code: 10, message: "No tiene permiso de perfil" } }, { status: 403 });
};
const orgs = await Promise.all(["a", "b"].map((letra) => dbRaw.org.create({ data: { nombre: `Messenger ${letra}`, slug: `msg-${letra}-${Date.now()}` } })));
const paginas = [String(Date.now()) + "1", String(Date.now()) + "2"];
const firma = (raw: string, secreto = process.env.META_APP_SECRET!) => `sha256=${createHmac("sha256", secreto).update(raw).digest("hex")}`;
const postRaw = (raw: string, signature = firma(raw)) => POST(new NextRequest("https://crm.prueba.test/api/messenger/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": signature } }));
const evento = (mid: string, extras: object = {}) => ({ sender: { id: "psid-cliente" }, recipient: { id: paginas[0] }, timestamp: Date.now(), message: { mid, text: "Hola", ...extras } });
const webhook = (messaging: unknown[], pagina = paginas[0]) => postRaw(JSON.stringify({ object: "page", entry: [{ id: pagina, messaging }] }));
const estadoEmpresa = (orgId: bigint) => runWithOrg(orgId, () => Promise.all([
  db.contacto.findMany(), db.conversacion.findMany(), db.mensaje.findMany(), db.oportunidad.findMany(),
  db.evento.findMany(), db.auditoriaBot.findMany(), db.ajustes.findMany(),
]));
try {
  const canales = await Promise.all(orgs.map((org, i) => runWithOrg(org.id, () => guardarCanalMessenger({ nombre: "Página", page_id: paginas[i], page_access_token: `token-pagina-${i}` }))));
  assert.deepEqual(suscripciones[0].subscribed_fields, CAMPOS_MESSENGER);
  const verificacion = await GET(new NextRequest("https://crm.prueba.test/api/messenger/webhook?hub.mode=subscribe&hub.verify_token=verify-messenger&hub.challenge=abc123"));
  assert.equal(verificacion.status, 200); assert.equal(await verificacion.text(), "abc123");
  assert.equal((await GET(new NextRequest("https://crm.prueba.test/api/messenger/webhook?hub.mode=subscribe&hub.verify_token=malo&hub.challenge=x"))).status, 403);
  assert.equal((await postRaw("{inválido", "sha256=mal" )).status, 401, "JSON inválido sin firma válida se rechaza");
  await runWithOrg(orgs[0].id, async () => assert.equal(await db.mensaje.count(), 0));
  assert.equal((await postRaw("{inválido")).status, 400);
  assert.equal((await webhook([evento("m-1")])).status, 200);
  await webhook([evento("m-1"), evento("m-2")]);
  await webhook([evento("m-1")], paginas[1]);
  const canal = await runWithOrg(orgs[0].id, () => db.canalWhatsapp.findUniqueOrThrow({ where: { id: BigInt(canales[0].id) } }));
  const conv = await runWithOrg(orgs[0].id, async () => {
    assert.equal(await db.contacto.count(), 1, "PSID repetido no crea otro contacto");
    assert.equal(await db.mensaje.count(), 2);
    const contacto = await db.contacto.findFirstOrThrow(); assert.equal(contacto.nombre, "psid-cliente", "perfil denegado degrada con PSID"); assert.equal(contacto.telefono, null);
    const config = canal.config as Record<string, string>; assert.ok(config.tokenEncrypted.startsWith("encv1:")); assert.ok(!JSON.stringify(config).includes("token-pagina-0"));
    return db.conversacion.findFirstOrThrow();
  });
  await runWithOrg(orgs[1].id, async () => assert.equal(await db.mensaje.count(), 1, "cada página usa su empresa"));
  const antesEco = conv.ultimoEntranteAt;
  await webhook([{ sender: { id: paginas[0] }, recipient: { id: "psid-cliente" }, timestamp: Date.now(), message: { mid: "eco-1", text: "Desde otro cliente", is_echo: true, app_id: "otra-app" } }]);
  await runWithOrg(orgs[0].id, async () => {
    assert.equal((await db.mensaje.findFirstOrThrow({ where: { waMessageId: "eco-1" } })).direccion, "saliente");
    assert.deepEqual((await db.conversacion.findUniqueOrThrow({ where: { id: conv.id } })).ultimoEntranteAt, antesEco);
  });
  await webhook([evento("eco-propio", { is_echo: true, app_id: "123" })]);
  await runWithOrg(orgs[0].id, async () => assert.equal(await db.mensaje.count({ where: { waMessageId: "eco-propio" } }), 0));
  const provider = makeMessengerProvider(canal.config);
  const ahora = Date.now();
  assert.deepEqual(tipoEnvioMessenger({ ultimoEntranteAt: new Date(ahora - 24 * 3600_000), humano: true }, ahora), { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
  assert.equal(tipoEnvioMessenger({ ultimoEntranteAt: new Date(ahora - 7 * 24 * 3600_000), humano: true }, ahora), null);
  await runWithOrg(orgs[0].id, async () => {
    assert.equal((await provider.enviarTexto("psid-cliente", "Dentro", { ultimoEntranteAt: new Date(), humano: false })).ok, true);
    assert.equal(envios.at(-1).messaging_type, "RESPONSE");
    const viejo = new Date(Date.now() - 25 * 3600_000);
    assert.equal((await provider.enviarTexto("psid-cliente", "Asesor", { ultimoEntranteAt: viejo, humano: true })).ok, true);
    assert.equal(envios.at(-1).tag, "HUMAN_AGENT");
    const previos = envios.length;
    assert.equal((await provider.enviarTexto("psid-cliente", "Bot", { ultimoEntranteAt: viejo })).ok, false);
    assert.equal((await provider.enviarTexto("psid-cliente", "Asesor tardío", { ultimoEntranteAt: new Date(Date.now() - 8 * 24 * 3600_000), humano: true })).ok, false);
    assert.equal(envios.length, previos);
    assert.equal((await provider.enviarMedia("psid-cliente", "https://8.8.8.8/imagen.png", "imagen", "Texto primero", undefined, { ultimoEntranteAt: new Date() })).ok, true);
    assert.equal(envios.at(-2).message.text, "Texto primero"); assert.equal(envios.at(-1).message.attachment.type, "image");
    await db.mensaje.create({ data: { conversacionId: conv.id, direccion: "saliente", contenido: "Acuse", waMessageId: "acuse", status: "enviado" } });
    await db.conversacion.update({ where: { id: conv.id }, data: { ultimoEntranteAt: viejo } });
    await db.bot.create({ data: { nombre: "Bot Messenger", apiToken: `token-messenger-${paginas[0]}`, webhookUrl: "https://8.8.8.8/bot", canalId: canal.id, permisos: ["enviar_mensaje"] } });
  });
  await webhook([{ sender: { id: "psid-cliente" }, delivery: { mids: ["acuse"] } }]);
  await runWithOrg(orgs[0].id, async () => assert.equal((await db.mensaje.findFirstOrThrow({ where: { waMessageId: "acuse" } })).status, "entregado"));
  await webhook([{ sender: { id: "psid-cliente" }, read: { watermark: Date.now() + 1000 } }]);
  await webhook([{ sender: { id: "psid-cliente" }, delivery: { mids: ["acuse"] } }]);
  await runWithOrg(orgs[0].id, async () => assert.equal((await db.mensaje.findFirstOrThrow({ where: { waMessageId: "acuse" } })).status, "leido", "acuses no retroceden"));
  const rBot = await respuestaBot(new NextRequest("https://crm.prueba.test/api/v1/accounts/1/conversations/1/messages", { method: "POST", headers: { api_access_token: `token-messenger-${paginas[0]}` }, body: JSON.stringify({ content: "Fuera de ventana" }) }), { params: Promise.resolve({ accountId: "1", conversationId: String(conv.id) }) });
  assert.equal(rBot!.status, 502);
  await runWithOrg(orgs[0].id, async () => {
    assert.match((await db.mensaje.findFirstOrThrow({ where: { status: "fallido" } })).errorDetalle!, /24 h/);
    tokenInvalido = true;
    assert.equal((await provider.enviarTexto("psid-cliente", "Token vencido", { ultimoEntranteAt: new Date() })).ok, false);
    const desconectado = await db.canalWhatsapp.findUniqueOrThrow({ where: { id: canal.id } }); assert.equal(desconectado.estado, "desconectado");
    assert.match((await listarCanales())[0].errorAutorizacion!, /token/);
  });
  assert.equal((await webhook([{ postback: { payload: "ignorado" } }])).status, 200);
  const archivo = `o${orgs[0].id}-123-${"a".repeat(32)}.png`;
  const url = new URL(urlMediaPublica(`/api/media/${archivo}`));
  assert.ok(firmaMediaValida(archivo, url.searchParams.get("vence"), url.searchParams.get("firma")));
  assert.equal(firmaMediaValida(archivo.replace("123-", "124-"), url.searchParams.get("vence"), url.searchParams.get("firma")), false);
  assert.equal(firmaMediaValida(archivo, "1", url.searchParams.get("firma")), false);
  await runWithOrg(orgs[1].id, async () => {
    const secretoPropio = "secreto-app-propia-messenger";
    const creado = await guardarCanalMessenger({ nombre: "App propia", page_id: `${paginas[1]}3`, page_access_token: "token-propio",
      app_secret: secretoPropio, app_id: "456" });
    const id = BigInt(creado.id);
    const configurado = await db.canalWhatsapp.findUniqueOrThrow({ where: { id } });
    const config = configurado.config as Record<string, string>;
    assert.ok(config.appSecretEncrypted.startsWith("encv1:"));
    assert.equal(decryptMetaToken(config.appSecretEncrypted), secretoPropio);
    assert.ok(!JSON.stringify(config).includes(secretoPropio));
    assert.equal(config.appId, "456");
    const editado = await guardarCanalMessenger({ nombre: "App propia editada" }, id);
    await guardarCanalMessenger({ app_secret: "", app_id: "" }, id);
    assert.deepEqual((await db.canalWhatsapp.findUniqueOrThrow({ where: { id } })).config, config, "editar sin credenciales o con vacíos las conserva");
    const lista = await listarCanales();
    assert.equal(lista.find((c) => c.id === id)?.appId, "456");
    const bitacora = { auditoria: await db.auditoriaBot.findMany(), eventos: await db.evento.findMany() };
    const publico = JSON.stringify({ creado, editado, lista, bitacora }, (_clave, valor) => typeof valor === "bigint" ? String(valor) : valor);
    for (const privado of [secretoPropio, config.appSecretEncrypted, "app_secret", "appSecretEncrypted"]) assert.ok(!publico.includes(privado), `no expone ${privado === secretoPropio ? "el secreto" : "campos privados"}`);
    for (const entrada of [{ app_secret: 123 }, { app_secret: "   " }, { app_id: "invalido" }]) {
      await assert.rejects(() => guardarCanalMessenger(entrada, id), /inválido/);
    }
    const paginaPropia = config.pageId;
    const enviarPropio = (mid: string, secreto = secretoPropio, extras: object = {}) => {
      const raw = JSON.stringify({ object: "page", entry: [{ id: paginaPropia, messaging: [evento(mid, extras)] }] });
      return postRaw(raw, firma(raw, secreto));
    };
    assert.equal((await enviarPropio("app-propia-1")).status, 200);
    assert.equal(await db.mensaje.count({ where: { canalId: id, waMessageId: "app-propia-1" } }), 1);
    const antesRechazo = await estadoEmpresa(orgs[1].id);
    const graphAntes = llamadasGraph;
    assert.equal((await enviarPropio("global-no-autoriza", process.env.META_APP_SECRET)).status, 401);
    const acuseSinFirma = JSON.stringify({ object: "page", entry: [{ id: paginaPropia, messaging: [{ read: { mids: ["app-propia-1"] } }] }] });
    assert.equal((await postRaw(acuseSinFirma, "sha256=incorrecta")).status, 401);
    assert.deepEqual(await estadoEmpresa(orgs[1].id), antesRechazo, "firma inválida no escribe mensajes, acuses ni datos asociados");
    assert.equal(llamadasGraph, graphAntes, "no consulta Graph sin autenticar");
    const raw = JSON.stringify({ object: "page", entry: [{ id: paginaPropia, messaging: [evento("raw-alterado")] }] });
    assert.equal((await postRaw(raw + " ", firma(raw, secretoPropio))).status, 401, "firma sobre el cuerpo crudo exacto");
    const paginaGlobal = `${paginas[0]}4`;
    const global = await runWithOrg(orgs[0].id, () => guardarCanalMessenger({ nombre: "App global", page_id: paginaGlobal, page_access_token: "token-global" }));
    for (const [indice, secreto] of [secretoPropio, process.env.META_APP_SECRET!].entries()) {
      const mixto = JSON.stringify({ object: "page", entry: [
        { id: paginaGlobal, messaging: [evento(`mixto-${indice}`)] },
        { id: paginaPropia, messaging: [evento(`mixto-${indice}`)] },
      ] });
      assert.equal((await postRaw(mixto, firma(mixto, secreto))).status, 200);
      assert.equal(await db.mensaje.count({ where: { canalId: id, waMessageId: `mixto-${indice}` } }), indice === 0 ? 1 : 0);
      await runWithOrg(orgs[0].id, async () => assert.equal(await db.mensaje.count({ where: { canalId: BigInt(global.id), waMessageId: `mixto-${indice}` } }), indice === 1 ? 1 : 0));
    }
    assert.equal((await webhook([evento("desconocida")], "99999999999999999999")).status, 200);
    await db.canalWhatsapp.update({ where: { id }, data: { config: { ...config, appSecretEncrypted: "encv1:roto" } } });
    const antesCifradoRoto = await estadoEmpresa(orgs[1].id);
    assert.equal((await enviarPropio("cifrado-roto-global", process.env.META_APP_SECRET)).status, 401);
    assert.equal((await enviarPropio("cifrado-roto-propio")).status, 401);
    assert.deepEqual(await estadoEmpresa(orgs[1].id), antesCifradoRoto, "un secreto ilegible no habilita el global");
    await db.canalWhatsapp.update({ where: { id }, data: { config } });
  });
  console.log("OK · Messenger simulado: configuración cifrada y privada, firma por página y global, rechazo sin escrituras/Graph, cuerpos mixtos, PSID, aislamiento, ecos, acuses, ventanas, bot, token y media firmada");
} finally { globalThis.fetch = fetchOriginal; await dbRaw.$disconnect(); }
