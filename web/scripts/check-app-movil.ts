import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";
import { NextRequest } from "next/server";

for (const valor of [process.env.DATABASE_URL, process.env.ADMIN_DATABASE_URL]) {
  if (!valor) throw new Error("Define DATABASE_URL y ADMIN_DATABASE_URL");
  const url = new URL(valor);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/app_movil_test") {
    throw new Error("La prueba solo admite localhost/app_movil_test");
  }
}
process.env.NEXTAUTH_SECRET ??= "secreto-local-app-movil-test";
process.env.NEXTAUTH_URL = "http://127.0.0.1:3119";
process.env.VAPID_PUBLIC_KEY = "";
process.env.VAPID_PRIVATE_KEY = "";
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: "prueba@app-movil.test", project_id: "proyecto-prueba",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" })
});

const llamadas: Array<{ url: string; body?: any }> = [];
const fetchOriginal = globalThis.fetch;
let falloFcm = false;
let timeoutFcm = false;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "acceso-simulado", expires_in: 3600 });
  if (url === "https://fcm.googleapis.com/v1/projects/proyecto-prueba/messages:send") {
    if (timeoutFcm) return new Promise<Response>((_, reject) => {
      const fallar = () => reject(new DOMException("Tiempo agotado", "AbortError"));
      if (init?.signal?.aborted) fallar();
      else init?.signal?.addEventListener("abort", fallar, { once: true });
    });
    const body = JSON.parse(String(init?.body));
    llamadas.push({ url, body });
    if (falloFcm) return Response.json({ error: { status: "INTERNAL" } }, { status: 500 });
    if (body.message.token === "caducado") return Response.json({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }, { status: 404 });
    return Response.json({ name: "simulado" });
  }
  throw new Error(`Red externa bloqueada: ${url}`);
};

const admin = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
const { db, dbRaw, runWithOrg } = await import("../src/lib/db");
const { validarCredenciales } = await import("../src/lib/auth-credenciales");
const { POST: login } = await import("../src/app/api/movil/login/route");
const { registrarDispositivo, borrarDispositivo } = await import("../src/lib/dispositivos-push");
const { enviarPushAOrg } = await import("../src/lib/push");
const { decode, getToken } = await import("next-auth/jwt");

async function main() {
  const sufijo = Date.now().toString(36);
  const orgA = await admin.query<{ id: string }>("INSERT INTO orgs(nombre,slug) VALUES($1,$2) RETURNING id", ["Móvil A", `movil-a-${sufijo}`]);
  const orgB = await admin.query<{ id: string }>("INSERT INTO orgs(nombre,slug) VALUES($1,$2) RETURNING id", ["Móvil B", `movil-b-${sufijo}`]);
  const a = BigInt(orgA.rows[0].id), b = BigInt(orgB.rows[0].id);
  const hash = await bcrypt.hash("ClavePrueba2026", 10);
  const usuarioA = await admin.query<{ id: string }>("INSERT INTO usuarios(org_id,nombre,email,password_hash,rol) VALUES($1,'Agente A',$2,$3,'admin') RETURNING id", [String(a), `a-${sufijo}@prueba.test`, hash]);
  const usuarioB = await admin.query<{ id: string }>("INSERT INTO usuarios(org_id,nombre,email,password_hash,rol) VALUES($1,'Agente B',$2,$3,'agente') RETURNING id", [String(b), `b-${sufijo}@prueba.test`, hash]);
  const ua = BigInt(usuarioA.rows[0].id), ub = BigInt(usuarioB.rows[0].id);
  const headers = { host: "127.0.0.1:3119", "x-real-ip": "192.0.2.101" };

  assert.equal((await validarCredenciales({ email: `a-${sufijo}@prueba.test`, password: "ClavePrueba2026", orgSlug: `movil-a-${sufijo}`, headers }))?.id, String(ua));
  assert.equal(await validarCredenciales({ email: `a-${sufijo}@prueba.test`, password: "mala", orgSlug: `movil-a-${sufijo}`, headers }), null);
  const cuerpo = { org: `movil-a-${sufijo}`, email: `a-${sufijo}@prueba.test`, password: "ClavePrueba2026" };
  const respuesta = await login(new NextRequest("http://127.0.0.1:3119/api/movil/login", { method: "POST", headers, body: JSON.stringify(cuerpo) }));
  assert.equal(respuesta.status, 200);
  const datos = await respuesta.json();
  assert.ok(datos.token.length <= 3933);
  assert.equal(datos.usuario.id, String(ua));
  assert.equal(datos.org.slug, cuerpo.org);
  assert.equal(respuesta.headers.get("cache-control"), "no-store");
  const token = await decode({ token: datos.token, secret: process.env.NEXTAUTH_SECRET! });
  for (const campo of ["sub", "name", "email", "id", "rol", "orgId", "puesto", "emitidoAt", "checkedAt", "iat", "exp"]) assert.ok(token?.[campo]);
  const bearer = await getToken({ req: new NextRequest("http://127.0.0.1:3119/api/shell", { headers: { Authorization: `Bearer ${datos.token}` } }) });
  assert.equal(bearer?.orgId, String(a));
  const fallas = [
    { ...cuerpo, password: "incorrecta" }, { ...cuerpo, org: "org-inexistente" }
  ];
  for (const body of fallas) {
    const r = await login(new NextRequest("http://127.0.0.1:3119/api/movil/login", { method: "POST", headers, body: JSON.stringify(body) }));
    assert.equal(r.status, 401);
    assert.deepEqual(await r.json(), { error: "credenciales inválidas" });
  }
  const comprobar401 = async (org: string, email: string) => {
    const r = await login(new NextRequest("http://127.0.0.1:3119/api/movil/login", { method: "POST", headers,
      body: JSON.stringify({ org, email, password: "ClavePrueba2026" }) }));
    assert.equal(r.status, 401);
    assert.deepEqual(await r.json(), { error: "credenciales inválidas" });
  };
  await admin.query("UPDATE usuarios SET activo=false WHERE id=$1", [String(ub)]);
  await comprobar401(`movil-b-${sufijo}`, `b-${sufijo}@prueba.test`);
  await admin.query("UPDATE usuarios SET activo=true WHERE id=$1", [String(ub)]);
  await admin.query("UPDATE orgs SET activo=false WHERE id=$1", [String(b)]);
  await comprobar401(`movil-b-${sufijo}`, `b-${sufijo}@prueba.test`);
  await admin.query("UPDATE orgs SET activo=true WHERE id=$1", [String(b)]);
  for (let i = 0; i < 9; i++) await validarCredenciales({ email: `limite-${sufijo}@prueba.test`, password: "mala", orgSlug: `movil-b-${sufijo}`, headers: { ...headers, "x-real-ip": "192.0.2.201" } });
  assert.equal(await validarCredenciales({ email: `limite-${sufijo}@prueba.test`, password: "ClavePrueba2026", orgSlug: `movil-b-${sufijo}`, headers: { ...headers, "x-real-ip": "192.0.2.201" } }), null);
  for (let i = 0; i < 30; i++) await validarCredenciales({ email: `ip-${i}-${sufijo}@prueba.test`, password: "mala", orgSlug: `movil-b-${sufijo}`, headers: { ...headers, "x-real-ip": "192.0.2.202" } });
  assert.equal(await validarCredenciales({ email: `b-${sufijo}@prueba.test`, password: "ClavePrueba2026", orgSlug: `movil-b-${sufijo}`, headers: { ...headers, "x-real-ip": "192.0.2.202" } }), null);

  await registrarDispositivo(a, ua, "compartido", "android");
  assert.equal((await runWithOrg(a, () => db.dispositivoPush.findMany())).length, 1);
  assert.equal((await runWithOrg(b, () => db.dispositivoPush.findMany())).length, 0);
  await registrarDispositivo(b, ub, "compartido", "ios");
  assert.equal((await runWithOrg(a, () => db.dispositivoPush.findMany())).length, 0);
  assert.equal((await runWithOrg(b, () => db.dispositivoPush.findMany())).length, 1);
  await runWithOrg(a, () => borrarDispositivo(ua, "compartido"));
  assert.equal((await runWithOrg(b, () => db.dispositivoPush.findMany())).length, 1);
  await registrarDispositivo(a, ua, "caducado", "android");
  await registrarDispositivo(a, ua, "vigente", "ios");
  await runWithOrg(a, () => enviarPushAOrg("Nuevo", "Mensaje", "/chat?conv=12"));
  assert.equal(llamadas.length, 2);
  assert.ok(llamadas.every((x) => x.body.message.data.conversacionId === "12"));
  assert.ok(llamadas.every((x) => Object.values(x.body.message.data).every((v) => typeof v === "string")));
  assert.equal((await runWithOrg(a, () => db.dispositivoPush.findMany({ where: { tokenFcm: "caducado" } }))).length, 0);
  falloFcm = true;
  await runWithOrg(a, () => enviarPushAOrg("Pedido", "Nuevo pedido", "/ventas/7"));
  assert.equal(llamadas.at(-1)?.body.message.data.conversacionId, undefined);
  assert.equal((await runWithOrg(a, () => db.dispositivoPush.findMany({ where: { tokenFcm: "vigente" } }))).length, 1);
  falloFcm = false;
  timeoutFcm = true;
  const inicioTimeout = Date.now();
  await runWithOrg(a, () => enviarPushAOrg("Aviso", "Tiempo agotado", "/chat?conv=12"));
  assert.ok(Date.now() - inicioTimeout < 9500, "FCM no debe bloquear más de ~8 s");
  timeoutFcm = false;
  await admin.query("UPDATE orgs SET activo=false WHERE id=$1", [String(b)]);
  assert.equal(await validarCredenciales({ email: `b-${sufijo}@prueba.test`, password: "ClavePrueba2026", orgSlug: `movil-b-${sufijo}`, headers }), null);
  console.log("check-app-movil OK: credenciales y límites, token, RLS, reasignación, FCM simulado");
}

try { await main(); }
finally { globalThis.fetch = fetchOriginal; await admin.end(); await dbRaw.$disconnect(); }
