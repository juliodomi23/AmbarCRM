import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { graphSimulado } from "./meta-facebook-simulado.mjs";

assert.equal(new URL(process.env.DATABASE_URL!).port, "55450");
process.env.NEXTAUTH_URL = "http://127.0.0.1:3118";
process.env.META_APP_ID = "123";
process.env.META_APP_SECRET = "secreto-meta-simulado";
const require = createRequire(import.meta.url);
const auth = require("next-auth/next");
const sesionOriginal = auth.getServerSession;
const fetchOriginal = globalThis.fetch;
const org = await dbRaw.org.create({ data: { nombre: "Facebook rutas", slug: `facebook-rutas-${Date.now()}` } });
let sesion: { user: { id: string; orgId: string; rol: string } } | null = { user: { id: "1001", orgId: String(org.id), rol: "admin" } };
auth.getServerSession = async () => sesion;
globalThis.fetch = graphSimulado;

const { POST: paginas } = require("../../src/app/api/canales/messenger/facebook/paginas/route.ts");
const { POST: conectar } = require("../../src/app/api/canales/messenger/facebook/conectar/route.ts");
const origen = "http://127.0.0.1:3118";
const base = `${origen}/api/canales/messenger/facebook`;
const cookieSesion = "next-auth.session-token=sesion-rutas-simulada";
const post = (ruta: "paginas" | "conectar", body: object, extras: { state?: string; cookie?: string; origin?: string } = {}) => {
  const req = new NextRequest(`${base}/${ruta}`, {
    method: "POST", headers: { origin: extras.origin ?? origen, cookie: extras.cookie ?? cookieSesion, "content-type": "application/json", ...(extras.state ? { "x-messenger-state": extras.state } : {}) },
    body: JSON.stringify(body),
  });
  return ruta === "paginas" ? paginas(req) : conectar(req);
};

try {
  for (const ruta of ["paginas", "conectar"] as const) {
    sesion = null;
    assert.equal((await post(ruta, {})).status, 401);
    sesion = { user: { id: "1001", orgId: String(org.id), rol: "agente" } };
    assert.equal((await post(ruta, {})).status, 403);
    sesion.user.rol = "admin";
    assert.equal((await post(ruta, {}, { origin: "https://ajeno.test" })).status, 403);
    assert.equal((await post(ruta, {}, { origin: "" })).status, 403);
  }
  const inicio = await post("paginas", { accion: "iniciar" });
  assert.equal(inicio.status, 200);
  assert.equal(inicio.headers.get("cache-control"), "no-store");
  const atributos = inicio.headers.get("set-cookie")!;
  assert.match(atributos, /HttpOnly/i); assert.match(atributos, /SameSite=strict/i); assert.match(atributos, /Max-Age=600/);
  const cookie = `${cookieSesion}; ${atributos.split(";", 1)[0]}`;
  const datos = await inicio.json();
  assert.equal(datos.appId, "123");
  assert.equal(datos.scope, "pages_show_list,pages_messaging,pages_manage_metadata");
  const codigo = String(Date.now());
  for (const state of [undefined, "0".repeat(64)]) {
    assert.equal((await post("paginas", { code: codigo }, { cookie, state })).status, 403);
  }
  assert.equal((await post("paginas", { code: codigo }, { state: datos.state })).status, 403, "requiere cookie del intento");
  const lista = await post("paginas", { code: codigo }, { cookie, state: datos.state });
  assert.equal(lista.status, 200);
  const texto = await lista.text();
  assert.ok(!/access_token|pagina-privada|usuario-largo|tokenEncrypted|secreto-meta/.test(texto));
  const items = JSON.parse(texto);
  assert.deepEqual(Object.keys(items[0]).sort(), ["foto", "id", "nombre"]);
  assert.equal((await post("conectar", { page_id: "no-autorizada" }, { cookie, state: datos.state })).status, 403);
  assert.equal((await post("conectar", { page_id: items[0].id }, { cookie })).status, 403);
  const conectado = await post("conectar", { page_id: items[0].id }, { cookie, state: datos.state });
  assert.equal(conectado.status, 200);
  assert.match(conectado.headers.get("set-cookie")!, /Max-Age=0/);
  assert.equal((await post("conectar", { page_id: items[0].id }, { cookie, state: datos.state })).status, 403);
  const permiso = await post("paginas", { accion: "iniciar" });
  const estado = await permiso.json();
  const permisoCookie = `${cookieSesion}; ${permiso.headers.get("set-cookie")!.split(";", 1)[0]}`;
  const rechazo = await post("paginas", { code: "permisos" }, { cookie: permisoCookie, state: estado.state });
  assert.equal(rechazo.status, 424);
  const error = await rechazo.text();
  assert.match(error, /no tiene permiso.*conexión manual/); assert.ok(!error.includes("TOKEN-SECRETO"));
  for (const ruta of ["paginas", "conectar"] as const) {
    let respuesta;
    for (let n = 0; n < 21; n++) {
      respuesta = await post(ruta, {});
      if (respuesta.status === 429) break;
    }
    assert.equal(respuesta?.status, 429);
    assert.equal(respuesta.headers.get("retry-after"), "600");
  }
  console.log("OK · Rutas Facebook en proceso: 401/403, admin, Origin, cookies, CSRF, respuesta sin tokens, selección, consumo, permisos recortados y rate limit");
} finally {
  auth.getServerSession = sesionOriginal;
  globalThis.fetch = fetchOriginal;
  await runWithOrg(org.id, async () => { await db.messengerLogin.deleteMany(); await db.canalWhatsapp.updateMany({ data: { activo: false } }); });
  await dbRaw.$disconnect();
}
