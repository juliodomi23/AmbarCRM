import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";
import { dbRaw } from "../../src/lib/db";
import { negocioPublico } from "../../src/lib/pedidos-db";
import { bloquearProductos, transaccionTenant } from "../../src/lib/retail-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3118";
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 991n;
const otraOrgId = orgId + 1n;
const slug = `tienda-e2e-${sufijo}`;
const email = `pedidos-${sufijo}@test.local`;
const password = "Pedidos-E2E-2026!";

function cookiesDe(respuesta: Response) {
  const headers = respuesta.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? [respuesta.headers.get("set-cookie") ?? ""]).filter(Boolean).map((v) => v.split(";", 1)[0]).join("; ");
}
function combinarCookies(actual: string, nuevas: string) {
  const mapa = new Map<string, string>();
  for (const parte of `${actual};${nuevas}`.split(";").map((p) => p.trim()).filter(Boolean)) mapa.set(parte.split("=", 1)[0], parte);
  return [...mapa.values()].join("; ");
}
async function login() {
  const csrf = await fetch(`${baseUrl}/api/auth/csrf`);
  let cookie = cookiesDe(csrf);
  const token = (await csrf.json()).csrfToken;
  const body = new URLSearchParams({ csrfToken: token, email, password, orgSlug: slug, callbackUrl: `${baseUrl}/pedidos-en-linea`, json: "true" });
  const respuesta = await fetch(`${baseUrl}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" }, body });
  cookie = combinarCookies(cookie, cookiesDe(respuesta));
  assert.match(cookie, /next-auth\.session-token/);
  return cookie;
}
async function json(ruta: string, method = "GET", body?: unknown, cookie = "", ip = "203.0.113.10") {
  const respuesta = await fetch(`${baseUrl}${ruta}`, { method, redirect: "manual", headers: { "x-real-ip": ip, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { respuesta, data: await respuesta.json().catch(() => ({})) };
}
async function preparar(id: bigint, slugOrg: string, usuario: boolean) {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, $2, $3)", [String(id), usuario ? "Tienda E2E" : "Otra tienda", slugOrg]);
  return transaccionTenant(id, async (tx) => {
    await tx.moduloOrg.createMany({ data: [{ clave: "productos", activo: true, config: {} }, { clave: "ventas", activo: true, config: {} }, { clave: "pedidos_en_linea", activo: true, config: { permiteEntrega: true, permiteRecoger: true, minimoCompra: "0", costoEnvio: "5", maxPorTelefono: 2, maxPorIp: 2 } }] });
    if (usuario) await tx.usuario.create({ data: { nombre: "Admin pedidos", email, passwordHash: await bcrypt.hash(password, 10), rol: "admin", puesto: "Administrador" } });
    const visible = await tx.producto.create({ data: { sku: `VISIBLE-${id}`, nombre: usuario ? "Manzana pública" : "Producto ajeno", precio: 10, stock: 0, visibleEnLinea: true, activo: true, unidad: "kg", vendePorPeso: true } });
    await bloquearProductos(tx, [visible.id]);
    await tx.producto.update({ where: { id: visible.id }, data: { stock: 10 } });
    const oculto = await tx.producto.create({ data: { sku: `OCULTO-${id}`, nombre: "Producto oculto", precio: 1, stock: 3, visibleEnLinea: false } });
    const inactivo = await tx.producto.create({ data: { sku: `INACTIVO-${id}`, nombre: "Producto inactivo", precio: 1, stock: 3, visibleEnLinea: true, activo: false } });
    return { visible, oculto, inactivo };
  });
}

async function main() {
  const base = await preparar(orgId, slug, true);
  const ajena = await preparar(otraOrgId, `otra-tienda-${sufijo}`, false);
  assert.ok(await negocioPublico(slug), "el negocio preparado debe resolver en el proceso de prueba");
  const catalogo = await json(`/api/public/tienda/${slug}`);
  assert.equal(catalogo.respuesta.status, 200, JSON.stringify(catalogo.data));
  assert.deepEqual(catalogo.data.productos.map((p: { nombre: string }) => p.nombre), ["Manzana pública"]);
  const pagina = await fetch(`${baseUrl}/tienda/${slug}`, { redirect: "manual" });
  assert.equal(pagina.status, 200);

  const uuid = randomUUID();
  const cuerpo = { uuidCliente: uuid, nombre: "Cliente Web", telefono: "5512345678", tipoEntrega: "domicilio", direccion: "Dirección privada 123", total: "0.01", partidas: [{ productoId: String(base.visible.id), cantidad: "2" }] };
  const pedido = await json(`/api/public/tienda/${slug}`, "POST", cuerpo);
  const repetido = await json(`/api/public/tienda/${slug}`, "POST", cuerpo);
  assert.equal(pedido.respuesta.status, 201);
  assert.equal(pedido.data.total, "25.00");
  assert.equal(repetido.respuesta.status, 200);
  assert.equal(repetido.data.repetido, true);
  const seguimiento = await json(`/api/public/tienda/pedido/${pedido.data.token}`);
  const inventado = await json(`/api/public/tienda/pedido/${"a".repeat(32)}`);
  assert.equal(seguimiento.respuesta.status, 200);
  assert.equal(inventado.respuesta.status, 404);
  assert.equal("direccionEntrega" in seguimiento.data, false);

  const ajeno = await json(`/api/public/tienda/${slug}`, "POST", { ...cuerpo, uuidCliente: randomUUID(), partidas: [{ productoId: String(ajena.visible.id), cantidad: "1" }] }, "", "203.0.113.20");
  assert.equal(ajeno.respuesta.status, 404);
  const segundo = await json(`/api/public/tienda/${slug}`, "POST", { ...cuerpo, uuidCliente: randomUUID(), tipoEntrega: "recoger", direccion: "", partidas: [{ productoId: String(base.visible.id), cantidad: "1" }] });
  const tercero = await json(`/api/public/tienda/${slug}`, "POST", { ...cuerpo, uuidCliente: randomUUID(), tipoEntrega: "recoger", direccion: "", partidas: [{ productoId: String(base.visible.id), cantidad: "1" }] });
  assert.equal(segundo.respuesta.status, 201);
  assert.equal(tercero.respuesta.status, 429);
  const porIp1 = await json(`/api/public/tienda/${slug}`, "POST", { ...cuerpo, uuidCliente: randomUUID(), telefono: "5510000001", tipoEntrega: "recoger", direccion: "", partidas: [{ productoId: String(base.visible.id), cantidad: "1" }] }, "", "203.0.113.30");
  const porIp2 = await json(`/api/public/tienda/${slug}`, "POST", { ...cuerpo, uuidCliente: randomUUID(), telefono: "5510000002", tipoEntrega: "recoger", direccion: "", partidas: [{ productoId: String(base.visible.id), cantidad: "1" }] }, "", "203.0.113.30");
  const porIp3 = await json(`/api/public/tienda/${slug}`, "POST", { ...cuerpo, uuidCliente: randomUUID(), telefono: "5510000003", tipoEntrega: "recoger", direccion: "", partidas: [{ productoId: String(base.visible.id), cantidad: "1" }] }, "", "203.0.113.30");
  assert.deepEqual([porIp1.respuesta.status, porIp2.respuesta.status, porIp3.respuesta.status], [201, 201, 429]);
  const uuidCancelar = randomUUID();
  const pedidoCancelar = await json(`/api/public/tienda/${slug}`, "POST", { ...cuerpo, uuidCliente: uuidCancelar, telefono: "5510000004", tipoEntrega: "recoger", direccion: "", partidas: [{ productoId: String(base.visible.id), cantidad: "1" }] }, "", "203.0.113.40");
  assert.equal(pedidoCancelar.respuesta.status, 201);

  const cookie = await login();
  const panel = await fetch(`${baseUrl}/pedidos-en-linea`, { headers: { Cookie: cookie }, redirect: "manual" });
  assert.equal(panel.status, 200);
  const intentaConsumirReservado = await json("/api/ventas", "POST", { estado: "pendiente", canal: "mostrador", descuento: "0", partidas: [{ productoId: String(base.visible.id), cantidad: "6" }] }, cookie);
  assert.equal(intentaConsumirReservado.respuesta.status, 400);
  const ventaCancelar = await transaccionTenant(orgId, (tx) => tx.venta.findFirstOrThrow({ where: { uuidCliente: uuidCancelar }, select: { id: true } }));
  const cancelar = await json(`/api/ventas/${ventaCancelar.id}`, "PATCH", { estado: "cancelada" }, cookie);
  assert.equal(cancelar.respuesta.status, 200);
  const confirmar = await json(`/api/ventas/${(await transaccionTenant(orgId, (tx) => tx.venta.findFirstOrThrow({ where: { uuidCliente: uuid }, select: { id: true } }))).id}`, "PATCH", { estado: "preparando" }, cookie);
  assert.equal(confirmar.respuesta.status, 200);
  const estado = await transaccionTenant(orgId, async (tx) => ({
    ventasUuid: await tx.venta.count({ where: { uuidCliente: uuid } }),
    pedidosTelefono: await tx.venta.count({ where: { canal: "tienda_en_linea", contacto: { telefono: { endsWith: "5512345678" } } } }),
    pedidosIp: await tx.venta.count({ where: { canal: "tienda_en_linea", pedidoIp: "203.0.113.30" } }),
    stock: (await tx.producto.findUniqueOrThrow({ where: { id: base.visible.id } })).stock,
    reservaActiva: await tx.reservaPedido.count({ where: { venta: { uuidCliente: uuid }, activa: true } }),
    reservaCanceladaActiva: await tx.reservaPedido.count({ where: { venta: { uuidCliente: uuidCancelar }, activa: true } }),
  }));
  assert.deepEqual({ ventasUuid: estado.ventasUuid, pedidosTelefono: estado.pedidosTelefono, stock: Number(estado.stock), reservaActiva: estado.reservaActiva }, { ventasUuid: 1, pedidosTelefono: 2, stock: 8, reservaActiva: 0 });
  assert.equal(estado.pedidosIp, 2);
  assert.equal(estado.reservaCanceladaActiva, 0);
  console.log(JSON.stringify({
    loginReal: true, panel: panel.status, paginaPublica: pagina.status,
    catalogo: { visibles: catalogo.data.productos.map((p: { nombre: string }) => p.nombre), ocultoExcluido: true, inactivoExcluido: true, otraEmpresaExcluida: true },
    precioServidor: { enviado: "0.01", subtotal: "20.00", envio: "5.00", total: pedido.data.total },
    idempotencia: { primera: pedido.respuesta.status, repetida: repetido.respuesta.status, ventas: estado.ventasUuid },
    limitesReales: { telefono: { segundo: segundo.respuesta.status, tercero: tercero.respuesta.status, pedidosContados: estado.pedidosTelefono }, ip: { respuestas: [porIp1.respuesta.status, porIp2.respuesta.status, porIp3.respuesta.status], pedidosContados: estado.pedidosIp } },
    seguimiento: { propio: seguimiento.respuesta.status, inventado: inventado.respuesta.status, sinDireccion: true },
    aislamientoProductoAjeno: ajeno.respuesta.status,
    confirmacion: { status: confirmar.respuesta.status, stockFinal: Number(estado.stock), reservaActiva: estado.reservaActiva },
    reservaContraOtrosCanales: intentaConsumirReservado.respuesta.status,
    cancelacionLiberaReserva: { status: cancelar.respuesta.status, reservaActiva: estado.reservaCanceladaActiva },
  }));
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    const tablas = await admin.query<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id'");
    for (const id of [orgId, otraOrgId]) {
      for (const { table_name } of tablas.rows) await admin.query(`DELETE FROM "${table_name.replaceAll('"', '""')}" WHERE org_id = $1`, [String(id)]);
      await admin.query("DELETE FROM orgs WHERE id = $1", [String(id)]);
    }
  } finally { await admin.query("SET session_replication_role = origin"); }
}
main().catch((error) => { console.error("FALLO:", error); process.exitCode = 1; }).finally(async () => { await limpiar().catch(console.error); await Promise.all([dbRaw.$disconnect(), admin.end()]); });
