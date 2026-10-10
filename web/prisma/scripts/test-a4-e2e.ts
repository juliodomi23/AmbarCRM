import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";
import { Prisma } from "@prisma/client";
import { registrarVentaCaja } from "../../src/lib/caja-db";
import { registrarDevolucion } from "../../src/lib/caja-a2-db";
import { cambiarEstadoVenta } from "../../src/lib/venta-estado-db";
import { dbRaw } from "../../src/lib/db";
import { transaccionTenant } from "../../src/lib/retail-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3118";
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const orgId = BigInt(Date.now()) * 1000n + 998n;
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const slug = `a4-e2e-${sufijo}`;
const password = "A4-E2E-2026!";
const emails = { admin: `admin-${sufijo}@test.local`, encargado: `encargado-${sufijo}@test.local`, cajero: `cajero-${sufijo}@test.local` };

function cookiesDe(respuesta: Response) {
  const headers = respuesta.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? [respuesta.headers.get("set-cookie") ?? ""]).filter(Boolean).map((valor) => valor.split(";", 1)[0]).join("; ");
}
function combinarCookies(actual: string, nuevas: string) {
  const mapa = new Map<string, string>();
  for (const parte of `${actual};${nuevas}`.split(";").map((valor) => valor.trim()).filter(Boolean)) mapa.set(parte.split("=", 1)[0], parte);
  return [...mapa.values()].join("; ");
}
async function login(email: string) {
  const csrf = await fetch(`${baseUrl}/api/auth/csrf`);
  let cookie = cookiesDe(csrf);
  const token = (await csrf.json()).csrfToken;
  const respuesta = await fetch(`${baseUrl}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: token, email, password, orgSlug: slug, callbackUrl: `${baseUrl}/reportes-retail`, json: "true" }) });
  cookie = combinarCookies(cookie, cookiesDe(respuesta));
  assert.match(cookie, /next-auth\.session-token/);
  return cookie;
}
async function get(ruta: string, cookie: string) {
  const respuesta = await fetch(`${baseUrl}${ruta}`, { headers: { Cookie: cookie }, redirect: "manual" });
  return { respuesta, data: await respuesta.json().catch(() => ({})) };
}

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'A4 E2E', $2)", [String(orgId), slug]);
  return transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.createMany({ data: [
      { clave: "caja", activo: true, config: {} }, { clave: "productos", activo: true, config: {} }, { clave: "ventas", activo: true, config: {} },
      { clave: "reservas_en_linea", activo: true, config: { zona: "America/Mexico_City" } },
    ] });
    const hash = await bcrypt.hash(password, 10);
    const usuarioAdmin = await tx.usuario.create({ data: { nombre: "Admin A4", email: emails.admin, passwordHash: hash, rol: "admin", puesto: "Administrador" } });
    await tx.usuario.create({ data: { nombre: "Encargada A4", email: emails.encargado, passwordHash: hash, rol: "agente", puesto: "Encargado de tienda" } });
    await tx.usuario.create({ data: { nombre: "Cajero A4", email: emails.cajero, passwordHash: hash, rol: "agente", puesto: "Cajero" } });
    const caja = await tx.caja.create({ data: { nombre: `Caja A4 ${sufijo}` } });
    const turno = await tx.turnoCaja.create({ data: { cajaId: caja.id, usuarioId: usuarioAdmin.id, fondoInicial: 0 } });
    const padre = await tx.producto.create({ data: { sku: `PADRE-${sufijo}`, nombre: "=Familia peligrosa", precio: 100, costo: 40, stock: 0 } });
    const variante = await tx.producto.create({ data: { sku: `VAR-${sufijo}`, nombre: "=Variante peligrosa", grupoId: padre.id, atributos: { talla: "M" }, precio: 100, costo: 40, stock: 20 } });
    await tx.producto.create({ data: { sku: `QUIETO-${sufijo}`, nombre: "Sin movimiento", precio: 70, costo: 25, stock: 5 } });
    await tx.producto.create({ data: { sku: `MIN-${sufijo}`, nombre: "Bajo mínimo", precio: 50, costo: 20, stock: 1, stockMinimo: 2 } });
    await tx.promocion.create({ data: { nombre: "3x2 A4", tipo: "nxm", productoId: variante.id, cantidadCompra: 3, cantidadPaga: 2, inicia: new Date("2020-01-01T12:00:00Z"), termina: new Date("2099-12-31T12:00:00Z") } });
    return { usuarioAdmin, caja, turno, padre, variante };
  });
}

async function main() {
  const base = await preparar();
  const actor = { orgId, userId: base.usuarioAdmin.id, rol: "admin", puesto: "Administrador" };
  const venta = await registrarVentaCaja(actor, { turnoId: base.turno.id, contactoId: null, uuidCliente: randomUUID(), descuento: new Prisma.Decimal(20), notas: null, partidas: [{ productoId: base.variante.id, cantidad: new Prisma.Decimal(3), descuento: new Prisma.Decimal(0) }], pagos: [{ metodo: "efectivo", monto: new Prisma.Decimal(180) }] });
  const devolucion = await registrarDevolucion(actor, { ventaId: venta.venta.id, ventaCambioId: null, tipoReembolso: "efectivo", motivo: "A4", partidas: [{ ventaPartidaId: venta.venta.partidas[0].id, cantidad: new Prisma.Decimal(1) }] });
  const cancelada = await registrarVentaCaja(actor, { turnoId: base.turno.id, contactoId: null, uuidCliente: randomUUID(), descuento: new Prisma.Decimal(0), notas: null, partidas: [{ productoId: base.variante.id, cantidad: new Prisma.Decimal(1), descuento: new Prisma.Decimal(0) }], pagos: [{ metodo: "efectivo", monto: new Prisma.Decimal(100) }] });
  await cambiarEstadoVenta(actor, cancelada.venta.id, "cancelada");
  await transaccionTenant(orgId, async (tx) => {
    await tx.venta.update({ where: { id: venta.venta.id }, data: { createdAt: new Date("2026-10-10T02:00:00Z") } });
    await tx.devolucionVenta.update({ where: { id: devolucion.id }, data: { createdAt: new Date("2026-10-10T07:01:00Z") } });
    await tx.venta.update({ where: { id: cancelada.venta.id }, data: { createdAt: new Date("2026-10-10T02:30:00Z") } });
    const vieja = await tx.venta.create({ data: { folio: `VIEJA-${sufijo}`, creadoPorId: base.usuarioAdmin.id, cajaId: base.caja.id, estado: "pagada", canal: "mostrador", subtotal: 50, total: 50, stockAplicado: true, createdAt: new Date("2026-10-10T02:15:00Z") } });
    await tx.ventaPartida.create({ data: { ventaId: vieja.id, productoId: base.variante.id, cantidad: 1, precioUnitario: 50, costoUnitario: null, total: 50 } });
    await tx.turnoCaja.update({ where: { id: base.turno.id }, data: { estado: "cerrado", cerradoAt: new Date("2026-10-10T08:00:00Z"), efectivoEsperado: 170, efectivoContado: 160, diferencia: -10 } });
  });

  const [cookieAdmin, cookieEncargado, cookieCajero] = await Promise.all([login(emails.admin), login(emails.encargado), login(emails.cajero)]);
  const rango = "desde=2026-10-09&hasta=2026-10-10";
  const [apiAdmin, apiEncargado, apiCajero, paginaAdmin, paginaEncargado, paginaCajero, sinRango, rangoLargo] = await Promise.all([
    get(`/api/reportes/retail?${rango}`, cookieAdmin), get(`/api/reportes/retail?${rango}`, cookieEncargado), get(`/api/reportes/retail?${rango}`, cookieCajero),
    get("/reportes-retail", cookieAdmin), get("/reportes-retail", cookieEncargado), get("/reportes-retail", cookieCajero),
    get("/api/reportes/retail", cookieAdmin), get("/api/reportes/retail?desde=2025-01-01&hasta=2026-12-31", cookieAdmin),
  ]);
  assert.deepEqual([apiAdmin.respuesta.status, apiEncargado.respuesta.status, apiCajero.respuesta.status], [200, 200, 404]);
  assert.deepEqual([paginaAdmin.respuesta.status, paginaEncargado.respuesta.status, paginaCajero.respuesta.status], [200, 200, 200]);
  const vistaCajero = await fetch(`${baseUrl}/reportes-retail`, { headers: { Cookie: cookieCajero }, redirect: "manual" });
  const htmlCajero = await vistaCajero.text();
  assert.doesNotMatch(htmlCajero, /Utilidad, rotación, inventario/, "el render del Cajero no debe incluir el reporte antes de redirigir");
  assert.deepEqual([sinRango.respuesta.status, rangoLargo.respuesta.status], [400, 400]);
  const reporte = apiAdmin.data.reporte;
  assert.deepEqual(reporte.resumen, { ingresos: "170", costos: "80", utilidad: "40", ingresosSinCosto: "50", partidasSinCosto: 1 });
  assert.equal(reporte.conteos.ventas, 2, "la cancelada debe quedar fuera");
  assert.equal(reporte.conteos.devoluciones, 1);
  assert.deepEqual(reporte.ventas.porDia.map((fila: { clave: string; ingresos: string }) => [fila.clave, fila.ingresos]), [["2026-10-09", "230"], ["2026-10-10", "-60"]]);
  assert.equal(reporte.productos.variantes[0].nombre, "=Variante peligrosa");
  assert.equal(reporte.productos.agrupados[0].nombre, "=Familia peligrosa");
  assert.ok(reporte.inventario.filas.some((fila: { nombre: string; sinMovimiento: boolean }) => fila.nombre === "Sin movimiento" && fila.sinMovimiento));
  assert.ok(reporte.inventario.filas.some((fila: { nombre: string; alertaMinimo: boolean }) => fila.nombre === "Bajo mínimo" && fila.alertaMinimo));
  assert.ok(reporte.cortes.some((fila: { diferencia: string }) => fila.diferencia === "-10"));

  const csv = await fetch(`${baseUrl}/api/reportes/retail?${rango}&formato=csv`, { headers: { Cookie: cookieAdmin } });
  const textoCsv = await csv.text();
  assert.equal(csv.status, 200);
  assert.match(textoCsv, /'=Variante peligrosa/);
  assert.match(textoCsv, /'=Familia peligrosa/);
  console.log(JSON.stringify({
    permisos: { admin: apiAdmin.respuesta.status, encargado: apiEncargado.respuesta.status, cajero: apiCajero.respuesta.status },
    paginas: { admin: paginaAdmin.respuesta.status, encargado: paginaEncargado.respuesta.status, cajeroSinReporteAntesDeRedirigir: true },
    cuadre: reporte.resumen,
    zonaLocal: reporte.ventas.porDia.map((fila: { clave: string; ingresos: number }) => ({ dia: fila.clave, ingreso: fila.ingresos })),
    canceladasExcluidas: reporte.conteos.ventas === 2,
    variantes: { variante: reporte.productos.variantes[0].nombre, agrupada: reporte.productos.agrupados[0].nombre },
    inventario: { sinMovimiento: true, bajoMinimo: true },
    cortes: { diferencia: -10 }, csv: { status: csv.status, formulasProtegidas: true }, limites: { sinRango: sinRango.respuesta.status, mayorUnAnio: rangoLargo.respuesta.status },
  }));
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    const tablas = await admin.query<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id'");
    for (const { table_name } of tablas.rows) await admin.query(`DELETE FROM "${table_name.replaceAll('"', '""')}" WHERE org_id = $1`, [String(orgId)]);
    await admin.query("DELETE FROM orgs WHERE id = $1", [String(orgId)]);
  } finally { await admin.query("SET session_replication_role = origin"); }
}

main().catch((error) => { console.error("FALLO:", error); process.exitCode = 1; }).finally(async () => {
  await limpiar().catch(console.error);
  await Promise.all([dbRaw.$disconnect(), admin.end()]);
});
