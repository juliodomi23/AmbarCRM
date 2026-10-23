import assert from "node:assert/strict";
import pg from "pg";
import { decode, encode } from "next-auth/jwt";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

const base = process.env.APP_URL;
if (!base) throw new Error("APP_URL es obligatorio");
const url = new URL(base);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.protocol !== "http:") throw new Error("APP_URL solo admite HTTP local");
for (const valor of [process.env.DATABASE_URL, process.env.ADMIN_DATABASE_URL]) {
  if (!valor) throw new Error("Define DATABASE_URL y ADMIN_DATABASE_URL");
  const dbUrl = new URL(valor);
  if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname) || dbUrl.pathname !== "/app_movil_test") throw new Error("La prueba solo admite app_movil_test local");
}
const fetchLocal = (ruta: string, init?: RequestInit) => fetch(new URL(ruta, base), { ...init, redirect: "manual" });
const admin = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });

async function main() {
  const fixture = await admin.query<{ id: string; slug: string; email: string; usuario_id: string }>(
    `SELECT o.id,o.slug,u.email,u.id AS usuario_id FROM orgs o JOIN usuarios u ON u.org_id=o.id
     WHERE o.slug LIKE 'movil-a-%' AND o.activo ORDER BY o.id DESC LIMIT 1`
  );
  assert.equal(fixture.rowCount, 1, "ejecuta check:app-movil primero");
  const { id: orgId, slug, email, usuario_id: usuarioId } = fixture.rows[0];
  const login = await fetchLocal("/api/movil/login", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ org: slug, email, password: "ClavePrueba2026" }) });
  assert.equal(login.status, 200);
  const datos = await login.json();
  const bearer = { Authorization: `Bearer ${datos.token}` };
  console.log("login", JSON.stringify({ status: login.status, usuario: datos.usuario, org: datos.org, expiraEn: datos.expiraEn }));

  const csrf = await fetchLocal("/api/auth/csrf");
  assert.equal(csrf.status, 200);
  const csrfToken = (await csrf.json()).csrfToken as string;
  const csrfCookie = csrf.headers.get("set-cookie")?.split(";")[0] ?? "";
  const webLogin = await fetchLocal("/api/auth/callback/credentials", { method: "POST",
    headers: { Cookie: csrfCookie, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password: "ClavePrueba2026", orgSlug: slug, json: "true" }) });
  assert.ok([200, 302].includes(webLogin.status));
  const cookieSesion = webLogin.headers.get("set-cookie") ?? "";
  assert.ok(cookieSesion.includes("next-auth.session-token"));
  const expiracionCookie = /Expires=([^;]+)/i.exec(cookieSesion)?.[1];
  assert.ok(expiracionCookie);
  assert.ok(Math.abs(new Date(expiracionCookie).getTime() - Date.now() - 604800000) < 60000);
  console.log("login web", JSON.stringify({ status: webLogin.status, cookieSieteDias: true }));
  const cookieWeb = /(?:^|,\s*)(next-auth\.session-token=[^;]+)/.exec(cookieSesion)?.[1];
  assert.ok(cookieWeb);

  const shell = await fetchLocal("/api/shell", { headers: bearer });
  assert.equal(shell.status, 200);
  console.log("shell", JSON.stringify(await shell.json()).slice(0, 400));
  const lista = await fetchLocal("/api/conversaciones", { headers: bearer });
  assert.equal(lista.status, 200);
  console.log("conversaciones", JSON.stringify(await lista.json()).slice(0, 400));
  const sin = await fetchLocal("/api/shell");
  assert.equal(sin.status, 307);
  assert.ok(sin.headers.get("location")?.includes("/api/auth/signin") || sin.headers.get("location")?.includes("/login"));
  const malo = await fetchLocal("/api/shell", { headers: { Authorization: "Bearer inválido" } });
  assert.equal(malo.status, 401);
  assert.deepEqual(await malo.json(), { error: "no autorizado" });
  const revocado = await encode({ secret: process.env.NEXTAUTH_SECRET!, maxAge: 604800,
    token: { sub: usuarioId, id: usuarioId, orgId, rol: "admin", revocado: true } });
  const r = await fetchLocal("/api/shell", { headers: { Authorization: `Bearer ${revocado}` } });
  assert.equal(r.status, 401);
  const ganaCookie = await fetchLocal("/api/shell", { headers: { Authorization: `Bearer ${revocado}`, Cookie: cookieWeb } });
  assert.equal(ganaCookie.status, 200);

  const archivo = `o${orgId}-${Date.now()}-${"0".repeat(32)}.png`;
  const botToken = `bot-http-${Date.now()}`;
  await admin.query("INSERT INTO bots(org_id,nombre,webhook_url,api_token) VALUES($1,'Bot prueba','http://127.0.0.1:9',$2)", [orgId, botToken]);
  const directorio = path.join(process.cwd(), "uploads");
  await mkdir(directorio, { recursive: true });
  await writeFile(path.join(directorio, archivo), Buffer.from([137, 80, 78, 71]));
  try {
    const mediaBearer = await fetchLocal(`/api/media/${archivo}`, { headers: bearer });
    const mediaCookie = await fetchLocal(`/api/media/${archivo}`, { headers: { Cookie: cookieWeb } });
    const mediaBot = await fetchLocal(`/api/media/${archivo}`, { headers: { "x-bot-token": botToken } });
    const mediaSin = await fetchLocal(`/api/media/${archivo}`);
    assert.equal(mediaBearer.status, 200);
    assert.equal(mediaCookie.status, 200);
    assert.equal(mediaBot.status, 200);
    assert.equal(mediaSin.status, 401);
    console.log("media", JSON.stringify({ bearer: mediaBearer.status, cookie: mediaCookie.status, bot: mediaBot.status, sinCredenciales: mediaSin.status }));
  } finally { await unlink(path.join(directorio, archivo)); }
  const botEnMovil = await fetchLocal("/api/movil/renovar", { method: "POST", headers: { Authorization: `Bearer ${botToken}` } });
  assert.equal(botEnMovil.status, 401);
  const movilEnBot = await fetchLocal(`/api/v1/accounts/${orgId}/conversations`, { headers: bearer });
  assert.equal(movilEnBot.status, 401);

  const renovar = await fetchLocal("/api/movil/renovar", { method: "POST", headers: bearer });
  assert.equal(renovar.status, 200);
  const renovado = await renovar.json();
  assert.notEqual(renovado.token, datos.token);
  const [tokenPrimero, tokenSegundo] = await Promise.all([
    decode({ token: datos.token, secret: process.env.NEXTAUTH_SECRET! }),
    decode({ token: renovado.token, secret: process.env.NEXTAUTH_SECRET! })
  ]);
  assert.equal(tokenSegundo?.emitidoAt, tokenPrimero?.emitidoAt);
  console.log("renovar", JSON.stringify({ status: renovar.status, usuario: renovado.usuario, org: renovado.org }));
  const tokenFcm = `http-${Date.now()}`;
  const alta = await fetchLocal("/api/movil/dispositivo", { method: "POST", headers: { ...bearer, "Content-Type": "application/json" },
    body: JSON.stringify({ tokenFcm, plataforma: "android" }) });
  assert.equal(alta.status, 200);
  console.log("dispositivo", JSON.stringify(await alta.json()));
  const invalido = await fetchLocal("/api/movil/dispositivo", { method: "POST", headers: { ...bearer, "Content-Type": "application/json" },
    body: JSON.stringify({ tokenFcm: "", plataforma: "web" }) });
  assert.equal(invalido.status, 400);
  const logout = await fetchLocal("/api/movil/logout", { method: "POST", headers: { ...bearer, "Content-Type": "application/json" }, body: JSON.stringify({ tokenFcm }) });
  assert.equal(logout.status, 200);
  assert.equal((await admin.query("SELECT 1 FROM dispositivos_push WHERE token_fcm=$1", [tokenFcm])).rowCount, 0);
  console.log("logout", JSON.stringify(await logout.json()));

  const brand = await fetchLocal(`/api/public/brand?slug=${slug}`);
  assert.equal(brand.status, 200);
  console.log("brand", JSON.stringify(await brand.json()).slice(0, 400));
  const search = await fetchLocal("/api/buscar?q=zz", { headers: bearer });
  assert.equal(search.status, 200);
  console.log("buscar", JSON.stringify(await search.json()).slice(0, 400));
  const templates = await fetchLocal("/api/meta/templates?canalId=0", { headers: bearer });
  console.log("templates", templates.status, JSON.stringify(await templates.json()).slice(0, 300));

  const contacto = await admin.query<{ id: string }>("INSERT INTO contactos(org_id,nombre,telefono) VALUES($1,'Ana móvil',$2) RETURNING id", [orgId, `52${Date.now()}`]);
  const canal = await admin.query<{ id: string }>("INSERT INTO canales_whatsapp(org_id,nombre,proveedor,activo) VALUES($1,'WhatsApp local','cloud_api',true) RETURNING id", [orgId]);
  const conv = await admin.query<{ id: string }>("INSERT INTO conversaciones(org_id,contacto_id,canal_id,bot_activo,no_leidos) VALUES($1,$2,$3,true,1) RETURNING id", [orgId, contacto.rows[0].id, canal.rows[0].id]);
  const conversacionId = conv.rows[0].id;
  const etiqueta = await fetchLocal("/api/etiquetas", { method: "POST", headers: { ...bearer, "Content-Type": "application/json" }, body: JSON.stringify({ nombre: `VIP-${conversacionId}` }) });
  assert.equal(etiqueta.status, 200);
  const etiquetar = await fetchLocal(`/api/conversaciones/${conversacionId}`, { method: "PATCH", headers: { ...bearer, "Content-Type": "application/json" }, body: JSON.stringify({ etiquetas: [`VIP-${conversacionId}`] }) });
  assert.equal(etiquetar.status, 200);
  const detalle = await fetchLocal(`/api/conversaciones/${conversacionId}`, { headers: bearer });
  assert.equal(detalle.status, 200);
  console.log("detalle", JSON.stringify(await detalle.json()).slice(0, 500));
  const mensajes = await fetchLocal(`/api/conversaciones/${conversacionId}/mensajes`, { headers: bearer });
  assert.equal(mensajes.status, 200);
  console.log("mensajes", JSON.stringify(await mensajes.json()).slice(0, 300));
  const ejemploConv = await fetchLocal("/api/conversaciones", { headers: bearer });
  const convEtiquetada = (await ejemploConv.json()).conversaciones.find((c: any) => c.id === conversacionId);
  console.log("conversación etiquetada", JSON.stringify(convEtiquetada).slice(0, 700));
  const ventana = await fetchLocal("/api/mensajes/enviar", { method: "POST", headers: { ...bearer, "Content-Type": "application/json" }, body: JSON.stringify({ conversacionId, texto: "Hola" }) });
  assert.equal(ventana.status, 400);
  console.log("ventana cerrada", JSON.stringify(await ventana.json()));
  const cerrar = await fetchLocal(`/api/conversaciones/${conversacionId}`, { method: "PATCH", headers: { ...bearer, "Content-Type": "application/json" }, body: JSON.stringify({ estado: "cerrada" }) });
  assert.equal(cerrar.status, 200);
  assert.equal((await admin.query("SELECT estado FROM conversaciones WHERE id=$1", [conversacionId])).rows[0].estado, "cerrada");
  console.log("cerrar", JSON.stringify(await cerrar.json()));

  const stream = await fetch(new URL("/api/stream", base), { headers: bearer, signal: AbortSignal.timeout(6000) });
  assert.equal(stream.status, 200);
  const reader = stream.body!.getReader();
  const primero = new TextDecoder().decode((await reader.read()).value);
  assert.ok(primero.includes(": conectado"));
  const orgB = await admin.query<{ id: string }>("SELECT id FROM orgs WHERE slug=$1", [slug.replace("movil-a-", "movil-b-")]);
  const contactoB = await admin.query<{ id: string }>("INSERT INTO contactos(org_id,nombre,telefono) VALUES($1,'Contacto B',$2) RETURNING id", [orgB.rows[0].id, `52${Date.now()}8`]);
  const convB = await admin.query<{ id: string }>("INSERT INTO conversaciones(org_id,contacto_id) VALUES($1,$2) RETURNING id", [orgB.rows[0].id, contactoB.rows[0].id]);
  await admin.query("INSERT INTO mensajes(org_id,conversacion_id,direccion,contenido) VALUES($1,$2,'entrante','evento B')", [orgB.rows[0].id, convB.rows[0].id]);
  await admin.query("INSERT INTO mensajes(org_id,conversacion_id,direccion,contenido) VALUES($1,$2,'entrante','evento local')", [orgId, conversacionId]);
  const evento = new TextDecoder().decode((await reader.read()).value);
  assert.ok(evento.includes("data:"));
  assert.ok(evento.includes(`\"org_id\" : ${orgId}`));
  assert.ok(!evento.includes("evento B"));
  await reader.cancel();
  console.log("stream", JSON.stringify({ primero: primero.trim(), evento: evento.trim().slice(0, 300) }));
  await admin.query("UPDATE usuarios SET password_cambiada_at=now() WHERE id=$1", [usuarioId]);
  const vieja = await fetchLocal("/api/movil/renovar", { method: "POST", headers: bearer });
  assert.equal(vieja.status, 401);
  await admin.query("UPDATE usuarios SET password_cambiada_at=NULL WHERE id=$1", [usuarioId]);
  console.log("check-app-movil-http OK");
}

try { await main(); }
finally { await admin.end(); }
