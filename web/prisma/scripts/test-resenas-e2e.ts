import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import pg from "pg";
import { dbRaw } from "../../src/lib/db";
import { transaccionTenant } from "../../src/lib/retail-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3118";
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 971n;
const orgApagadaId = orgId + 1n;
const orgSinEnlaceId = orgId + 2n;
const slug = `e2e-resenas-${sufijo}`;
const slugApagada = `e2e-resenas-off-${sufijo}`;
const slugSinEnlace = `e2e-resenas-sinlink-${sufijo}`;
const password = "Resenas-E2E-2026!";
const emailAdmin = `resenas-admin-${sufijo}@test.local`;
const emailAgente = `resenas-agente-${sufijo}@test.local`;
const GOOGLE = "https://g.page/r/CresenaE2E/review";
const ipPrueba = `10.77.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;

function cookiesDe(respuesta: Response) {
  const headers = respuesta.headers as Headers & { getSetCookie?: () => string[] };
  const valores = headers.getSetCookie?.() ?? (respuesta.headers.get("set-cookie") ? [respuesta.headers.get("set-cookie")!] : []);
  return valores.map((valor) => valor.split(";", 1)[0]).join("; ");
}

function combinarCookies(actual: string, nuevas: string) {
  const mapa = new Map<string, string>();
  for (const parte of `${actual}; ${nuevas}`.split(";").map((item) => item.trim()).filter(Boolean)) mapa.set(parte.split("=", 1)[0], parte);
  return [...mapa.values()].join("; ");
}

async function login(email: string) {
  const csrf = await fetch(`${baseUrl}/api/auth/csrf`);
  let cookie = cookiesDe(csrf);
  const token = (await csrf.json()).csrfToken;
  const body = new URLSearchParams({ csrfToken: token, email, password, orgSlug: slug, callbackUrl: `${baseUrl}/resenas`, json: "true" });
  const respuesta = await fetch(`${baseUrl}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" }, body });
  cookie = combinarCookies(cookie, cookiesDe(respuesta));
  assert.ok(cookie.includes("session-token"));
  return cookie;
}

async function opinar(slugNegocio: string, cuerpo: unknown, ip = ipPrueba) {
  const respuesta = await fetch(`${baseUrl}/api/public/opinion/${slugNegocio}`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-real-ip": ip }, body: JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, data: await respuesta.json().catch(() => ({})) };
}

async function ajustes(cookie: string, cuerpo: unknown) {
  const respuesta = await fetch(`${baseUrl}/api/resenas/ajustes`, { method: "PATCH", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  return { status: respuesta.status, data: await respuesta.json().catch(() => ({})) };
}

async function preparar() {
  for (const [id, nombre, slugOrg] of [[orgId, "Reseñas E2E", slug], [orgApagadaId, "Reseñas apagadas", slugApagada], [orgSinEnlaceId, "Reseñas sin enlace", slugSinEnlace]] as const) {
    await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, $2, $3)", [id.toString(), nombre, slugOrg]);
  }
  await transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.create({ data: { clave: "resenas", activo: true, config: { enlaceGoogle: GOOGLE, diasEntreSolicitudes: 90 } } });
    const hash = await bcrypt.hash(password, 10);
    await tx.usuario.create({ data: { nombre: "Admin reseñas", email: emailAdmin, passwordHash: hash, rol: "admin", puesto: "Administrador" } });
    await tx.usuario.create({ data: { nombre: "Agente reseñas", email: emailAgente, passwordHash: hash, rol: "agente", puesto: "Recepción" } });
  });
  await transaccionTenant(orgApagadaId, (tx) => tx.moduloOrg.create({ data: { clave: "resenas", activo: false, config: { enlaceGoogle: GOOGLE } } }));
  await transaccionTenant(orgSinEnlaceId, (tx) => tx.moduloOrg.create({ data: { clave: "resenas", activo: true, config: { enlaceGoogle: "http://evil.test/g.page" } } }));
}

async function main() {
  await preparar();

  // La estrella no cambia el destino: 1 a 5 devuelven el mismo enlace configurado, y se guardan.
  const destinos = new Set<string>();
  for (const estrellas of [1, 2, 3, 4, 5]) {
    const { status, data } = await opinar(slug, { calificacion: estrellas, origen: "Mostrador" });
    assert.equal(status, 200);
    destinos.add(data.url);
  }
  assert.deepEqual([...destinos], [GOOGLE]);
  const guardadas = await transaccionTenant(orgId, (tx) => tx.resena.findMany({ orderBy: { id: "asc" } }));
  assert.deepEqual(guardadas.map((fila) => fila.calificacion), [1, 2, 3, 4, 5]);
  assert.ok(guardadas.every((fila) => fila.origen === "mostrador"), "el origen se normaliza a minúsculas");

  // Open redirect: ni el cuerpo ni el query mandan el destino.
  const intento = await opinar(slug, { calificacion: 5, url: "https://evil.test", redirect: "https://evil.test", next: "https://evil.test", origen: "https://evil.test" });
  assert.equal(intento.data.url, GOOGLE);
  const conQuery = await fetch(`${baseUrl}/api/public/opinion/${slug}?url=https://evil.test&redirect=https://evil.test`, { method: "POST", headers: { "Content-Type": "application/json", "x-real-ip": ipPrueba }, body: JSON.stringify({ calificacion: 3 }) });
  assert.equal((await conQuery.json()).url, GOOGLE);
  const origenInvalido = await transaccionTenant(orgId, (tx) => tx.resena.findFirstOrThrow({ orderBy: { id: "desc" }, where: { calificacion: 3 } }));
  assert.equal(origenInvalido.origen, "directo");
  const ultimaInvalida = await transaccionTenant(orgId, (tx) => tx.resena.findMany({ where: { calificacion: 5 }, orderBy: { id: "desc" }, take: 1 }));
  assert.equal(ultimaInvalida[0].origen, "directo", "un origen con una URL cae en directo");

  // Entradas inválidas.
  for (const calificacion of [0, 6, 2.5, "mala", null]) assert.equal((await opinar(slug, { calificacion })).status, 400);
  assert.equal((await opinar("no-existe-" + sufijo, { calificacion: 5 })).status, 404);
  assert.equal((await opinar(slugApagada, { calificacion: 5 })).status, 404, "módulo apagado");
  assert.equal((await opinar(slugSinEnlace, { calificacion: 5 })).status, 404, "enlace no válido en la configuración");

  // Páginas.
  assert.equal((await fetch(`${baseUrl}/opinion/${slug}?o=mesa-1`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/opinion/${slugApagada}`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/opinion/${slugSinEnlace}`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/resenas`, { redirect: "manual" })).status === 200, false, "el panel exige sesión");

  // Aislamiento: la empresa apagada no recibió nada.
  const otras = await transaccionTenant(orgApagadaId, (tx) => tx.resena.count());
  assert.equal(otras, 0);

  // Ajustes: permisos y validación.
  const cookieAdmin = await login(emailAdmin);
  const cookieAgente = await login(emailAgente);
  assert.equal((await ajustes(cookieAgente, { enlaceGoogle: GOOGLE, diasEntreSolicitudes: 30 })).status, 403);
  assert.equal((await ajustes("", { enlaceGoogle: GOOGLE, diasEntreSolicitudes: 30 })).status === 200, false);
  assert.equal((await ajustes(cookieAdmin, { enlaceGoogle: "http://evil.test", diasEntreSolicitudes: 30 })).status, 400);
  assert.equal((await ajustes(cookieAdmin, { enlaceGoogle: "https://evil.test/g.page", diasEntreSolicitudes: 30 })).status, 400);
  assert.equal((await ajustes(cookieAdmin, { enlaceGoogle: GOOGLE, diasEntreSolicitudes: 0 })).status, 400);
  const ok = await ajustes(cookieAdmin, { enlaceGoogle: "https://maps.app.goo.gl/nuevo", diasEntreSolicitudes: 45, plantillaNombre: "resena_gracias", plantillaIdioma: "es_MX" });
  assert.equal(ok.status, 200);
  const config = await transaccionTenant(orgId, (tx) => tx.moduloOrg.findFirstOrThrow({ where: { clave: "resenas" } }));
  assert.deepEqual(config.config, { enlaceGoogle: "https://maps.app.goo.gl/nuevo", diasEntreSolicitudes: 45, plantillaResena: { name: "resena_gracias", language: "es_MX" } });
  assert.equal((await opinar(slug, { calificacion: 4 })).data.url, "https://maps.app.goo.gl/nuevo");

  // Panel con sesión.
  const panel = await fetch(`${baseUrl}/resenas`, { headers: { Cookie: cookieAdmin } });
  assert.equal(panel.status, 200);
  const html = await panel.text();
  assert.match(html, /Reseñas de Google/);
  assert.match(html, /mostrador/);

  // Límite por IP: 30 por 10 min; la IP de prueba ya consumió varias.
  const otraIp = `10.78.${Math.floor(Math.random() * 200)}.1`;
  const estados: number[] = [];
  for (let i = 0; i < 32; i++) estados.push((await opinar(slug, { calificacion: 5 }, otraIp)).status);
  assert.equal(estados.filter((estado) => estado === 200).length, 30);
  assert.equal(estados.filter((estado) => estado === 429).length, 2);

  console.log(JSON.stringify({
    destinoPorEstrella: [...destinos], guardadas: guardadas.length, openRedirect: "ignorado",
    moduloApagado: 404, sinEnlaceValido: 404, agente: 403, enlaceMalo: 400, limitePorIp: { ok: 30, bloqueadas: 2 },
  }));
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    const tablas = await admin.query<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id'");
    for (const id of [orgId, orgApagadaId, orgSinEnlaceId]) {
      for (const { table_name } of tablas.rows) await admin.query(`DELETE FROM "${table_name.replaceAll('"', '""')}" WHERE org_id = $1`, [String(id)]);
      await admin.query("DELETE FROM orgs WHERE id = $1", [String(id)]);
    }
  } finally { await admin.query("SET session_replication_role = origin"); }
}

main().catch((error) => { console.error("FALLO:", error); process.exitCode = 1; }).finally(async () => {
  await limpiar().catch(console.error);
  await Promise.all([dbRaw.$disconnect(), admin.end()]);
});
