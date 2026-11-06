import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";

const base = process.env.E2E_BASE_URL!;
assert.equal(new URL(process.env.DATABASE_URL!).port, "55450");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
assert.equal(process.env.MESSENGER_GRAPH_SIMULADO, "1", "el servidor debe arrancar con meta-facebook-simulado.mjs");
const ruta = "/api/canales/messenger/facebook";
const org = await dbRaw.org.create({ data: { nombre: "Facebook HTTP", slug: `facebook-http-${Date.now()}` } });
const cookieDe = (res: Response) => res.headers.getSetCookie().map((cookie) => cookie.split(";", 1)[0]).join("; ");

async function login(rol: "admin" | "agente") {
  const email = `${rol}-${org.slug}@local.test`;
  await runWithOrg(org.id, async () => db.usuario.create({ data: { nombre: rol, email, rol, passwordHash: await bcrypt.hash("Password-local-2026", 4) } }));
  const csrf = await fetch(`${base}/api/auth/csrf`);
  const inicial = cookieDe(csrf);
  const { csrfToken } = await csrf.json();
  const res = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual", headers: { Cookie: inicial, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password: "Password-local-2026", orgSlug: org.slug, json: "true", callbackUrl: base }),
  });
  const cookie = `${inicial}; ${cookieDe(res)}`;
  assert.match(cookie, /next-auth.session-token/);
  return cookie;
}

try {
  const admin = await login("admin");
  const agente = await login("agente");
  const post = (endpoint: string, body: object, cookie = admin, state?: string, origin = base) => fetch(`${base}${ruta}/${endpoint}`, {
    method: "POST", redirect: "manual", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", ...(state ? { "x-messenger-state": state } : {}) }, body: JSON.stringify(body),
  });
  for (const endpoint of ["paginas", "conectar"]) {
    assert.equal((await post(endpoint, {}, agente)).status, 403, "solo administradores");
    const sinSesion = await post(endpoint, {}, "");
    assert.ok([307, 401].includes(sinSesion.status), "proxy o ruta impiden acceso sin sesión");
    assert.equal((await post(endpoint, {}, admin, undefined, "https://ajeno.test")).status, 403);
  }
  const inicio = await post("paginas", { accion: "iniciar" });
  assert.equal(inicio.status, 200);
  assert.equal(inicio.headers.get("cache-control"), "no-store");
  const setCookie = inicio.headers.get("set-cookie")!;
  assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /SameSite=strict/i); assert.match(setCookie, /Max-Age=600/);
  const datos = await inicio.json();
  assert.equal(datos.appId, "123");
  assert.equal(datos.scope, "pages_show_list,pages_messaging,pages_manage_metadata,pages_read_engagement,business_management");
  const cookie = `${admin}; ${cookieDe(inicio)}`;
  const codigo = String(Date.now());
  for (const state of [undefined, "0".repeat(64)]) {
    assert.equal((await post("paginas", { code: codigo }, cookie, state)).status, 403);
  }
  assert.equal((await post("paginas", { code: codigo }, admin, datos.state)).status, 403, "requiere cookie del intento");
  const lista = await post("paginas", { code: codigo }, cookie, datos.state);
  assert.equal(lista.status, 200);
  const texto = await lista.text();
  assert.ok(!/access_token|pagina-privada|usuario-largo|tokenEncrypted|secreto-meta/.test(texto));
  const paginas = JSON.parse(texto);
  assert.deepEqual(Object.keys(paginas[0]).sort(), ["foto", "id", "nombre"]);
  assert.equal((await post("conectar", { page_id: "no-autorizada" }, cookie, datos.state)).status, 403);
  assert.equal((await post("conectar", { page_id: paginas[0].id }, cookie)).status, 403);
  const conectado = await post("conectar", { page_id: paginas[0].id, nombre: "Facebook HTTP" }, cookie, datos.state);
  assert.equal(conectado.status, 200);
  assert.match(conectado.headers.get("set-cookie")!, /Max-Age=0/);
  const canal = await conectado.json();
  assert.ok(canal.id);
  assert.equal((await post("conectar", { page_id: paginas[0].id }, cookie, datos.state)).status, 403);
  const manual = await fetch(`${base}/api/canales`, { method: "POST", headers: { Cookie: admin, "Content-Type": "application/json" },
    body: JSON.stringify({ proveedor: "messenger", nombre: "Manual HTTP", page_id: `${codigo}3`, page_access_token: "token-manual-http" }) });
  assert.equal(manual.status, 201, "la conexión manual sigue operativa");
  const permisos = await post("paginas", { accion: "iniciar" });
  const estadoPermisos = await permisos.json();
  const rechazo = await post("paginas", { code: "permisos" }, `${admin}; ${cookieDe(permisos)}`, estadoPermisos.state);
  assert.equal(rechazo.status, 424);
  const error = await rechazo.text();
  assert.match(error, /no tiene permiso.*conexión manual/); assert.ok(!error.includes("TOKEN-SECRETO"));
  for (const endpoint of ["paginas", "conectar"]) {
    let respuesta: Response | undefined;
    for (let n = 0; n < 21; n++) {
      respuesta = await post(endpoint, {});
      if (respuesta.status === 429) break;
    }
    assert.equal(respuesta?.status, 429, `rate limit en ${endpoint}`);
    assert.equal(respuesta.headers.get("retry-after"), "600");
  }
  console.log("OK · HTTP Facebook: login real local, solo admin, origen, cookies, CSRF, respuesta sin tokens, selección, consumo, manual, permisos recortados y rate limit en ambas rutas");
} finally {
  await runWithOrg(org.id, async () => { await db.messengerLogin.deleteMany(); await db.canalWhatsapp.updateMany({ data: { activo: false } }); });
  await dbRaw.$disconnect();
}
