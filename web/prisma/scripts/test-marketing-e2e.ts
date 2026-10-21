import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import pg from "pg";
import type { CampanaMarketingDto, ListaCampanasDto } from "../../src/lib/marketing";

const baseUrl = process.env.E2E_BASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!baseUrl || !adminUrl) throw new Error("Define E2E_BASE_URL y ADMIN_DATABASE_URL locales explícitas.");
const base = new URL(baseUrl);
const baseDatos = new URL(adminUrl);
if (!["localhost", "127.0.0.1"].includes(base.hostname) || base.port !== "3120" ||
    !["localhost", "127.0.0.1"].includes(baseDatos.hostname) || baseDatos.port !== "55451") {
  throw new Error("Esta prueba sólo admite HTTP local :3120 y la BD desechable local :55451.");
}
const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const orgA = BigInt(Date.now()) * 1000n + 888n;
const orgB = orgA + 1n;
const slugA = `marketing-http-a-${sufijo}`;
const slugB = `marketing-http-b-${sufijo}`;
const password = "Marketing-HTTP-2026!";
const datosCampana = {
  nombre: "Campaña HTTP", objetivo: "mensajes", canal: "whatsapp", audiencia: "Clientes interesados",
  contenido: "Conoce nuestros servicios", fechaInicio: "2026-10-21", fechaFin: "2026-10-31", presupuesto: "600.25",
};
type RespuestaAPI = { status: number; data: Partial<ListaCampanasDto> & { campana?: CampanaMarketingDto; error?: string } };

function cookies(respuesta: Response) {
  return respuesta.headers.getSetCookie().map(valor => valor.split(";", 1)[0]).join("; ");
}

async function login(email: string, orgSlug: string) {
  const csrf = await fetch(`${baseUrl}/api/auth/csrf`);
  assert.equal(csrf.status, 200);
  const inicial = cookies(csrf);
  const { csrfToken } = await csrf.json();
  const respuesta = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { Cookie: inicial, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password, orgSlug, json: "true", callbackUrl: `${baseUrl}/marketing` }),
  });
  const sesion = `${inicial}; ${cookies(respuesta)}`;
  assert.match(sesion, /next-auth.session-token/, "NextAuth debe autenticar los usuarios sintéticos");
  const cuenta = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: sesion } }).then(res => res.json());
  assert.equal(cuenta.user.email, email);
  return sesion;
}

async function api(cookie: string, ruta: string, method = "GET", cuerpo?: unknown): Promise<RespuestaAPI> {
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    method, redirect: "manual", headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, data: await respuesta.json().catch(() => ({})) };
}

function campanaDe(respuesta: RespuestaAPI, status = 200) {
  assert.equal(respuesta.status, status, respuesta.data.error);
  assert.ok(respuesta.data.campana);
  return respuesta.data.campana;
}

async function main() {
  await admin.query("INSERT INTO orgs(id,nombre,slug) VALUES ($1,'Marketing HTTP A',$2),($3,'Marketing HTTP B',$4)", [String(orgA), slugA, String(orgB), slugB]);
  const hash = await bcrypt.hash(password, 10);
  const usuarios = [
    { org: orgA, nombre: "Admin", email: `admin-${sufijo}@test.local`, rol: "admin", puesto: "Administrador" },
    { org: orgA, nombre: "Marketing", email: `marketing-${sufijo}@test.local`, rol: "agente", puesto: "Mercadotecnia" },
    { org: orgA, nombre: "Sin acceso", email: `sinacceso-${sufijo}@test.local`, rol: "agente", puesto: "Agente" },
    { org: orgB, nombre: "Admin B", email: `admin-b-${sufijo}@test.local`, rol: "admin", puesto: "Administrador" },
  ];
  for (const usuario of usuarios) {
    await admin.query("INSERT INTO usuarios(org_id,nombre,email,password_hash,rol,puesto) VALUES ($1,$2,$3,$4,$5,$6)", [String(usuario.org), usuario.nombre, usuario.email, hash, usuario.rol, usuario.puesto]);
  }
  for (const org of [orgA, orgB]) {
    await admin.query("INSERT INTO modulos_org(org_id,clave,activo) VALUES ($1,'marketing',true),($1,'meta_ads',true)", [String(org)]);
  }
  const administrador = await login(usuarios[0].email, slugA);
  const marketing = await login(usuarios[1].email, slugA);
  const sinAcceso = await login(usuarios[2].email, slugA);
  const otroTenant = await login(usuarios[3].email, slugB);

  for (const ruta of ["/api/marketing/campanas", "/api/meta-ads/campanas"]) {
    assert.equal((await api("", ruta)).status, 307, "el proxy redirige al inicio de sesión");
    assert.equal((await api("", ruta, "POST", datosCampana)).status, 307, "el proxy redirige al inicio de sesión");
    assert.equal((await api(sinAcceso, ruta)).status, 403);
    assert.equal((await api(sinAcceso, ruta, "POST", datosCampana)).status, 403);
    assert.equal((await api(administrador, ruta)).status, 200);
    assert.equal((await api(marketing, ruta)).status, 200);
    assert.equal((await api(administrador, `${ruta}?page=0`)).status, 400);
    assert.equal((await api(administrador, ruta, "POST", null)).status, 400);
  }

  for (const [tipo, ruta] of [["marketing", "/api/marketing/campanas"], ["meta_ads", "/api/meta-ads/campanas"]]) {
    const canal = tipo === "meta_ads" ? "facebook_instagram" : "whatsapp";
    const creado = campanaDe(await api(marketing, ruta, "POST", { ...datosCampana, canal }), 201);
    const detalle = `${ruta}/${creado.id}`;
    assert.equal(creado.estado, "borrador");
    assert.equal(creado.presupuesto, "600.25");
    assert.equal(creado.fechaInicio, "2026-10-21");
    assert.equal(campanaDe(await api(administrador, detalle)).id, creado.id);
    assert.equal((await api("", detalle)).status, 307, "el proxy redirige al inicio de sesión");
    assert.equal((await api("", detalle, "PATCH", { version: 1, nombre: "Sin sesión" })).status, 307, "el proxy redirige al inicio de sesión");
    assert.equal((await api(sinAcceso, detalle)).status, 403);
    assert.equal((await api(sinAcceso, detalle, "PATCH", { version: 1, nombre: "Sin acceso" })).status, 403);
    assert.equal((await api(otroTenant, detalle)).status, 404);
    assert.equal((await api(otroTenant, detalle, "PATCH", { version: 1, nombre: "Cruce tenant" })).status, 404);
    const otraRuta = tipo === "marketing" ? "/api/meta-ads/campanas" : "/api/marketing/campanas";
    assert.equal((await api(administrador, `${otraRuta}/${creado.id}`)).status, 404);
    assert.equal((await api(administrador, `${otraRuta}/${creado.id}`, "PATCH", { version: 1, nombre: "Cruce módulo" })).status, 404);
    assert.equal((await api(administrador, detalle, "PATCH", { version: 1, orgId: String(orgB) })).status, 400);
    assert.equal((await api(administrador, detalle, "PATCH", { version: 1, estado: "aprobada" })).status, 400);
    assert.equal((await api(administrador, detalle, "PATCH", { version: 1, fechaInicio: "2026-02-30" })).status, 400);
    assert.equal((await api(administrador, `${ruta}/invalido`)).status, 404);
    const editada = campanaDe(await api(marketing, detalle, "PATCH", { version: 1, nombre: "Campaña HTTP editada" }));
    assert.equal(editada.version, 2);
    assert.equal((await api(marketing, detalle, "PATCH", { version: 1, nombre: "Versión antigua" })).status, 409);
    const revision = campanaDe(await api(marketing, detalle, "PATCH", { version: 2, accion: "enviar_revision" }));
    assert.equal(revision.estado, "en_revision");
    assert.equal((await api(marketing, detalle, "PATCH", { version: revision.version, accion: "aprobar" })).status, 403);
    assert.equal((await api(administrador, detalle, "PATCH", { version: revision.version, contenido: "Cambiar tras revisión" })).status, 409);
    const aprobada = campanaDe(await api(administrador, detalle, "PATCH", { version: revision.version, accion: "aprobar" }));
    assert.equal(aprobada.estado, "aprobada");
    assert.ok(aprobada.aprobadaAt && aprobada.aprobadaPorId);
    assert.equal((await api(marketing, detalle, "PATCH", { version: aprobada.version, accion: "devolver_borrador" })).status, 403);
    const reabierta = campanaDe(await api(administrador, detalle, "PATCH", { version: aprobada.version, accion: "devolver_borrador" }));
    assert.equal(reabierta.aprobadaAt, null);
    const archivada = campanaDe(await api(marketing, detalle, "PATCH", { version: reabierta.version, accion: "archivar" }));
    assert.equal(archivada.estado, "archivada");
    assert.equal((await api(administrador, detalle, "DELETE")).status, 405);
    assert.equal((await api(administrador, detalle, "PATCH", { version: archivada.version, nombre: "Cambiar archivo" })).status, 409);
    const listado = await api(administrador, `${ruta}?q=editada&estado=archivada`);
    assert.equal(listado.status, 200);
    assert.equal(listado.data.total, 1);
    assert.equal(listado.data.resumen?.archivada, 1);
    assert.equal(listado.data.campanas?.[0].id, creado.id);
    assert.equal((await api(otroTenant, ruta)).data.total, 0);
    await admin.query("UPDATE modulos_org SET activo=false WHERE org_id=$1 AND clave=$2", [String(orgA), tipo]);
    assert.equal((await api(administrador, ruta)).status, 404);
    assert.equal((await api(administrador, detalle)).status, 404);
    assert.equal((await api(marketing, ruta, "POST", { ...datosCampana, canal })).status, 404);
    assert.equal((await api(administrador, detalle, "PATCH", { version: archivada.version, accion: "archivar" })).status, 404);
    await admin.query("UPDATE modulos_org SET activo=true WHERE org_id=$1 AND clave=$2", [String(orgA), tipo]);
    console.log(`HTTP ${tipo}: login real, crear/leer/editar/revisar/aprobar/reabrir/archivar, redirección sin sesión y 403/404/405/409, tenant/tipo y módulo desactivado OK`);
  }
  const propuesta = campanaDe(await api(marketing, "/api/meta-ads/campanas", "POST", { ...datosCampana, canal: "facebook_instagram", presupuesto: "0" }), 201);
  assert.equal((await api(marketing, `/api/meta-ads/campanas/${propuesta.id}`, "PATCH", { version: 1, accion: "enviar_revision" })).status, 400);
  for (const ruta of ["/marketing", "/meta-ads"]) {
    assert.equal((await fetch(`${baseUrl}${ruta}`, { headers: { Cookie: administrador } })).status, 200);
  }
  console.log("HTTP Marketing/Meta Ads completo: presupuesto Meta, páginas protegidas y persistencia mediante NextAuth real OK; cero envíos externos");
}

try { await main(); }
finally {
  for (const tabla of ["campanas_marketing", "modulos_org", "usuarios"]) {
    await admin.query(`DELETE FROM ${tabla} WHERE org_id IN ($1,$2)`, [String(orgA), String(orgB)]);
  }
  await admin.query("DELETE FROM orgs WHERE id IN ($1,$2)", [String(orgA), String(orgB)]);
  await admin.end();
}
