import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { credencialesApi } from "../../src/lib/services/canales";
import { encryptMetaToken } from "../../src/lib/meta/credentials";

const base = process.env.E2E_BASE_URL!;
assert.equal(new URL(process.env.DATABASE_URL!).port, "55450");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const org = await dbRaw.org.create({ data: { nombre: "Canales HTTP", slug: `canales-http-${Date.now()}` } });
const credenciales = credencialesApi();
const email = `${org.slug}@local.test`;
const secretoMessenger = "secreto-messenger-http-privado";
const cookieDe = (r: Response) => r.headers.getSetCookie().map((c) => c.split(";", 1)[0]).join("; ");
try {
  const fixture = await runWithOrg(org.id, async () => {
    await db.usuario.create({ data: { nombre: "Admin canales", email, passwordHash: await bcrypt.hash("Canales-prueba-2026", 10), rol: "admin" } });
    const api = await db.canalWhatsapp.create({ data: { nombre: "API HTTP", proveedor: "api", estado: "conectado", config: { ...credenciales.config, webhookUrl: "https://127.0.0.1/bloqueado" } } });
    const contacto = await db.contacto.create({ data: { nombre: "Sin teléfono", canalId: api.id, identificadorExterno: "externo-http" } });
    const conv = await db.conversacion.create({ data: { contactoId: contacto.id, canalId: api.id } });
    const messenger = await db.canalWhatsapp.create({ data: { nombre: "Messenger HTTP", proveedor: "messenger", config: {
      pageId: `${Date.now()}999`, appId: "456", appSecretEncrypted: encryptMetaToken(secretoMessenger), tokenEncrypted: encryptMetaToken("token-http-simulado"),
    } } });
    const editable = await db.canalWhatsapp.create({ data: { nombre: "Messenger editable HTTP", proveedor: "messenger", config: { pageId: `${Date.now()}998` } } });
    const psid = await db.contacto.create({ data: { nombre: "PSID HTTP", canalId: messenger.id, identificadorExterno: "psid-http" } });
    await db.conversacion.create({ data: { contactoId: psid.id, canalId: messenger.id, ultimoEntranteAt: new Date(Date.now() - 25 * 3600_000) } });
    return { api, conv, messenger, editable };
  });
  const csrf = await fetch(`${base}/api/auth/csrf`); const inicial = cookieDe(csrf);
  const { csrfToken } = await csrf.json();
  const login = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { Cookie: inicial, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password: "Canales-prueba-2026", orgSlug: org.slug, json: "true", callbackUrl: `${base}/chat` }) });
  const cookie = `${inicial}; ${cookieDe(login)}`; assert.match(cookie, /next-auth.session-token/);
  const get = (ruta: string) => fetch(`${base}${ruta}`, { headers: { Cookie: cookie }, redirect: "manual" });
  const paginaMessenger = (fixture.messenger.config as { pageId: string }).pageId;
  const configurar = (ruta: string, method: string, datos: object) => fetch(`${base}${ruta}`, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(datos) });
  for (const [ruta, metodo, datos] of [
    ["/api/canales", "POST", { proveedor: "messenger", nombre: "Duplicada HTTP", page_id: paginaMessenger, page_access_token: "sin-usar" }],
    [`/api/canales/${fixture.editable.id}`, "PATCH", { page_id: paginaMessenger }],
  ] as const) {
    const duplicada = await configurar(ruta, metodo, datos);
    assert.equal(duplicada.status, 409);
    assert.deepEqual(await duplicada.json(), { error: "esa página ya está conectada" });
  }
  const configuracion = await (await get("/configuracion")).text();
  for (const privado of [secretoMessenger, "appSecretEncrypted", (fixture.messenger.config as { appSecretEncrypted: string }).appSecretEncrypted]) {
    assert.ok(!configuracion.includes(privado), "la configuración HTML/RSC no expone el secreto");
  }
  const entrada = await fetch(`${base}/api/canal-api/${fixture.api.id}/mensajes`, { method: "POST", headers: { "x-api-key": credenciales.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ contacto: { id_externo: "externo-http" }, mensaje: { id: "http-1", tipo: "texto", contenido: "Hola por HTTP" } }) });
  assert.equal(entrada.status, 200, "webhook sin sesión no redirige al login");
  const respuesta = await fetch(`${base}/api/mensajes/enviar`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ conversacionId: String(fixture.conv.id), texto: "Asesor sin teléfono" }) });
  assert.equal(respuesta.status, 502, "llega al proveedor y registra el rechazo SSRF sin exigir teléfono");
  const resultado = await respuesta.json(); assert.equal(resultado.mensaje.status, "fallido"); assert.match(resultado.error, /privada|local/);
  const nota = await fetch(`${base}/api/mensajes/enviar`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ conversacionId: String(fixture.conv.id), texto: "Nota privada HTTP", interna: true }) });
  assert.equal(nota.status, 200);
  const lista = await (await get("/api/conversaciones")).json();
  assert.ok(lista.conversaciones.some((c: any) => c.canalProveedor === "api"));
  assert.ok(lista.conversaciones.some((c: any) => c.canalProveedor === "messenger" && c.ultimoEntranteAt));
  const html = await (await get("/chat")).text();
  assert.match(html, /aria-label="API"/); assert.match(html, /aria-label="Messenger"/);
  const sinSesion = await fetch(`${base}/api/canal-api/${fixture.api.id}/mensajes`, { method: "POST", body: "{}", redirect: "manual" }); assert.equal(sinSesion.status, 401);
  const firmaMala = await fetch(`${base}/api/messenger/webhook`, { method: "POST", body: "{mal", redirect: "manual" }); assert.equal(firmaMala.status, 401);
  const desconexionSinSesion = await fetch(`${base}/api/canales/${fixture.messenger.id}`, { method: "DELETE", redirect: "manual" });
  assert.ok([307, 401].includes(desconexionSinSesion.status));
  const desconectado = await configurar(`/api/canales/${fixture.messenger.id}`, "DELETE", {});
  assert.equal(desconectado.status, 200);
  assert.deepEqual(await desconectado.json(), { ok: true, desuscrito: true });
  await runWithOrg(org.id, async () => {
    assert.equal(await db.canalWhatsapp.count({ where: { id: fixture.messenger.id } }), 0);
    assert.equal(await db.conversacion.count({ where: { contacto: { identificadorExterno: "psid-http" } } }), 1);
  });
  console.log("OK · HTTP real: login, duplicados Messenger 409 en alta/edición, configuración sin secretos, webhooks públicos, asesor sin teléfono, fallo visible, nota privada, iconos/datos y desconexión con rechazo sin sesión, desuscripción y conservación del histórico");
} finally { await dbRaw.$disconnect(); }
