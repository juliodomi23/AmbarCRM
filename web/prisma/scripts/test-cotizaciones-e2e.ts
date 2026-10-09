import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import pg from "pg";
import { Prisma } from "@prisma/client";
import { crearCotizacion } from "../../src/lib/cotizaciones-db";
import { dbRaw } from "../../src/lib/db";
import { bloquearProductos, transaccionTenant } from "../../src/lib/retail-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3117";
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 981n;
const otraOrgId = orgId + 1n;
const slug = `e2e-cotizaciones-${sufijo}`;
const email = `cotizaciones-${sufijo}@test.local`;
const password = "Cotizaciones-E2E-2026!";
const apiKey = process.env.WA_API_KEY ?? "cotizaciones-e2e-key";

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

async function peticion(ruta: string, cookie = "", method = "GET", body?: unknown) {
  const respuesta = await fetch(`${baseUrl}${ruta}`, { method, redirect: "manual", headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { respuesta, data: await respuesta.json().catch(() => ({})) };
}

async function login() {
  const csrf = await fetch(`${baseUrl}/api/auth/csrf`);
  let cookie = cookiesDe(csrf);
  const token = (await csrf.json()).csrfToken;
  const body = new URLSearchParams({ csrfToken: token, email, password, orgSlug: slug, callbackUrl: `${baseUrl}/cotizaciones`, json: "true" });
  const respuesta = await fetch(`${baseUrl}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" }, body });
  cookie = combinarCookies(cookie, cookiesDe(respuesta));
  assert.ok(cookie.includes("next-auth.session-token") || cookie.includes("__Secure-next-auth.session-token"));
  return cookie;
}

async function prepararOrg(id: bigint, nombre: string, slugOrg: string, conUsuario = false) {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, $2, $3)", [id.toString(), nombre, slugOrg]);
  return transaccionTenant(id, async (tx) => {
    await tx.moduloOrg.createMany({ data: [{ clave: "productos", activo: true, config: {} }, { clave: "ventas", activo: true, config: {} }, { clave: "cotizaciones", activo: true, config: { ivaPorcentaje: "16", preciosConIva: false } }] });
    const usuario = conUsuario ? await tx.usuario.create({ data: { nombre: "Administrador cotizaciones", email, passwordHash: await bcrypt.hash(password, 10), rol: "admin", puesto: "Administrador" } }) : null;
    const contacto = await tx.contacto.create({ data: { nombre: `Cliente ${nombre}`, telefono: `964${String(Date.now() + Number(id % 100n)).slice(-7)}` } });
    const producto = await tx.producto.create({ data: { sku: `E2E-COT-${id}-${sufijo}`, nombre: `Producto ${nombre}`, precio: new Prisma.Decimal("10.10"), stock: 0 } });
    await bloquearProductos(tx, [producto.id]);
    await tx.producto.update({ where: { id: producto.id }, data: { stock: 3 } });
    let oportunidad = null;
    if (conUsuario) {
      const embudo = await tx.embudo.create({ data: { nombre: "Embudo cotizaciones" } });
      const inicial = await tx.etapa.create({ data: { embudoId: embudo.id, nombre: "Propuesta", orden: 1 } });
      await tx.etapa.create({ data: { embudoId: embudo.id, nombre: "Ganada", orden: 2, tipo: "ganado" } });
      oportunidad = await tx.oportunidad.create({ data: { contactoId: contacto.id, embudoId: embudo.id, etapaId: inicial.id, titulo: "Oportunidad cotizada", responsableId: usuario!.id } });
    }
    return { usuario, contacto, producto, oportunidad };
  });
}

async function main() {
  const base = await prepararOrg(orgId, "Cotizaciones E2E", slug, true);
  const otra = await prepararOrg(otraOrgId, "Otra empresa", `otra-cot-${sufijo}`);
  const ajena = await crearCotizacion(otraOrgId, null, { contactoId: otra.contacto.id, oportunidadId: null, vigencia: new Date(Date.now() + 86400000), descuentoGeneral: new Prisma.Decimal(0), convertirVenta: false, notas: null, condiciones: null, partidas: [{ productoId: otra.producto.id, concepto: "ignorado", cantidad: new Prisma.Decimal(1), precio: null, descuento: new Prisma.Decimal(0) }] });
  const cookie = await login();
  const creada = await peticion("/api/cotizaciones", cookie, "POST", {
    contactoId: String(base.contacto.id), oportunidadId: String(base.oportunidad!.id), vigencia: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), descuento: "0.50", convertirVenta: true, total: "0.01",
    partidas: [{ productoId: String(base.producto.id), concepto: "Precio manipulado", cantidad: "1.5", precio: "999", descuento: "0.15" }],
  });
  assert.equal(creada.respuesta.status, 201);
  assert.equal(Number(creada.data.cotizacion.subtotal), 15.15);
  assert.equal(Number(creada.data.cotizacion.impuestos), 2.32);
  assert.equal(Number(creada.data.cotizacion.total), 16.82);
  const id = creada.data.cotizacion.id;
  const token = creada.data.cotizacion.tokenPublico;

  const propia = await peticion(`/api/cotizaciones/${id}`, cookie);
  const ajenaInterna = await peticion(`/api/cotizaciones/${ajena.id}`, cookie);
  assert.equal(propia.respuesta.status, 200);
  assert.equal(ajenaInterna.respuesta.status, 404);
  const paginaPublica = await fetch(`${baseUrl}/cotizacion/${token}`, { redirect: "manual" });
  const tokenInventado = await fetch(`${baseUrl}/cotizacion/${"a".repeat(32)}`, { redirect: "manual" });
  assert.equal(paginaPublica.status, 200);
  assert.equal(tokenInventado.status, 404);

  const aceptada = await peticion(`/api/public/cotizaciones/${token}/responder`, "", "POST", { accion: "aceptar", nombre: "Cliente que acepta" });
  const repetida = await peticion(`/api/public/cotizaciones/${token}/responder`, "", "POST", { accion: "aceptar", nombre: "Cliente que acepta" });
  assert.equal(aceptada.respuesta.status, 200);
  assert.equal(repetida.respuesta.status, 200);
  assert.equal(repetida.data.repetida, true);

  const vencida = await peticion("/api/cotizaciones", cookie, "POST", {
    contactoId: String(base.contacto.id), vigencia: "2026-10-01", descuento: "0", convertirVenta: false,
    partidas: [{ concepto: "Servicio vencido", cantidad: "1", precio: "20", descuento: "0" }],
  });
  assert.equal(vencida.respuesta.status, 201);
  const respuestaVencida = await peticion(`/api/public/cotizaciones/${vencida.data.cotizacion.tokenPublico}/responder`, "", "POST", { accion: "aceptar", nombre: "Fuera de tiempo" });
  assert.equal(respuestaVencida.respuesta.status, 409);

  const cronSinLlave = await fetch(`${baseUrl}/api/cron/vencer-cotizaciones`, { method: "POST" });
  const cronConLlave = await fetch(`${baseUrl}/api/cron/vencer-cotizaciones`, { method: "POST", headers: { "x-api-key": apiKey } });
  assert.equal(cronSinLlave.status, 401);
  assert.equal(cronConLlave.status, 200);

  const estado = await transaccionTenant(orgId, async (tx) => ({
    ventas: await tx.venta.count({ where: { canal: "cotizacion" } }),
    stock: Number((await tx.producto.findUniqueOrThrow({ where: { id: base.producto.id } })).stock),
    cotizacion: await tx.cotizacion.findUniqueOrThrow({ where: { id: BigInt(id) } }),
    vencida: await tx.cotizacion.findUniqueOrThrow({ where: { id: BigInt(vencida.data.cotizacion.id) } }),
    oportunidad: await tx.oportunidad.findUniqueOrThrow({ where: { id: base.oportunidad!.id } }),
    eventosGanada: await tx.evento.count({ where: { oportunidadId: base.oportunidad!.id, tipo: "ganada" } }),
  }));
  assert.equal(estado.ventas, 1);
  assert.equal(estado.stock, 1.5);
  assert.equal(estado.cotizacion.estado, "aceptada");
  assert.equal(estado.vencida.estado, "vencida");
  assert.equal(estado.oportunidad.estado, "ganado");
  assert.equal(estado.eventosGanada, 1);

  console.log(JSON.stringify({
    loginReal: true,
    totalServidor: { enviadoPorNavegador: 0.01, subtotal: 15.15, impuestos: 2.32, total: 16.82 },
    aislamiento: { propia: propia.respuesta.status, otraEmpresa: ajenaInterna.respuesta.status },
    paginaPublica: { propia: paginaPublica.status, tokenInventado: tokenInventado.status },
    respuesta: { primeraAceptacion: aceptada.respuesta.status, repetidaIdempotente: repetida.respuesta.status, unaVenta: estado.ventas, stockFinal: estado.stock, oportunidad: estado.oportunidad.estado, eventosGanada: estado.eventosGanada },
    vencimiento: { aceptarVencida: respuestaVencida.respuesta.status, cronSinLlave: cronSinLlave.status, cronConLlave: cronConLlave.status, estado: estado.vencida.estado },
  }));
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    const tablas = await admin.query<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id'");
    for (const id of [orgId, otraOrgId]) {
      for (const { table_name } of tablas.rows) await admin.query(`DELETE FROM "${table_name.replaceAll('"', '""')}" WHERE org_id = $1`, [id.toString()]);
      await admin.query("DELETE FROM orgs WHERE id = $1", [id.toString()]);
    }
  } finally { await admin.query("SET session_replication_role = origin"); }
}

main().catch((error) => { console.error("FALLO:", error); process.exitCode = 1; }).finally(async () => {
  await limpiar().catch((error) => console.error("No se pudo limpiar:", error));
  await Promise.all([dbRaw.$disconnect(), admin.end()]);
});
