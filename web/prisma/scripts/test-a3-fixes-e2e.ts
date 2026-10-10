import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
const orgId = BigInt(Date.now()) * 1000n + 995n;
const slug = `a3-fixes-${sufijo}`;
const email = `cajero-a3-${sufijo}@test.local`;
const password = "A3-Fixes-2026!";

function cookiesDe(respuesta: Response) {
  const headers = respuesta.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? [respuesta.headers.get("set-cookie") ?? ""]).filter(Boolean).map((valor) => valor.split(";", 1)[0]).join("; ");
}

function combinarCookies(actual: string, nuevas: string) {
  const mapa = new Map<string, string>();
  for (const parte of `${actual};${nuevas}`.split(";").map((valor) => valor.trim()).filter(Boolean)) mapa.set(parte.split("=", 1)[0], parte);
  return [...mapa.values()].join("; ");
}

async function login() {
  const csrf = await fetch(`${baseUrl}/api/auth/csrf`);
  let cookie = cookiesDe(csrf);
  const token = (await csrf.json()).csrfToken;
  const respuesta = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual", headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: token, email, password, orgSlug: slug, callbackUrl: `${baseUrl}/caja`, json: "true" }),
  });
  cookie = combinarCookies(cookie, cookiesDe(respuesta));
  assert.match(cookie, /next-auth\.session-token/);
  return cookie;
}

async function json(ruta: string, method: string, body: unknown, cookie = "") {
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/json", "x-real-ip": "203.0.113.95" },
    body: JSON.stringify(body),
  });
  return { respuesta, data: await respuesta.json().catch(() => ({})) };
}

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'A3 fixes', $2)", [String(orgId), slug]);
  return transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.createMany({ data: [
      { clave: "caja", activo: true, config: { descuentoMaximoCajero: 10 } },
      { clave: "ventas", activo: true, config: {} },
      { clave: "productos", activo: true, config: {} },
      { clave: "pedidos_en_linea", activo: true, config: { maxPorTelefono: 10, maxPorIp: 10 } },
    ] });
    const usuario = await tx.usuario.create({ data: { nombre: "Cajero A3", email, passwordHash: await bcrypt.hash(password, 10), rol: "agente", puesto: "Cajero" } });
    const caja = await tx.caja.create({ data: { nombre: `Caja ${sufijo}` } });
    const turno = await tx.turnoCaja.create({ data: { cajaId: caja.id, usuarioId: usuario.id, fondoInicial: 0 } });
    const contacto = await tx.contacto.create({ data: { nombre: "Cliente sin lista", telefono: `55${String(Date.now()).slice(-8)}` } });
    const promo = await tx.producto.create({ data: { sku: `PROMO-${sufijo}`, nombre: "Producto 3x2", precio: 100, stock: 20 } });
    const publico = await tx.producto.create({ data: { sku: `PUBLICO-${sufijo}`, nombre: "Precio público", precio: 120, costo: 30, stock: 20, visibleEnLinea: true } });
    const lista = await tx.listaPrecio.create({ data: { nombre: `Público ${sufijo}`, tipo: "publico", activa: true } });
    await tx.listaPrecioProducto.create({ data: { listaId: lista.id, productoId: publico.id, precio: 80 } });
    await tx.promocion.create({ data: { nombre: "3x2", tipo: "nxm", productoId: promo.id, cantidadCompra: 3, cantidadPaga: 2, inicia: new Date("2020-01-01T12:00:00Z"), termina: new Date("2099-12-31T12:00:00Z") } });
    return { turno, contacto, promo, publico };
  });
}

function ventaCaja(turnoId: bigint, productoId: bigint, total: string, descuento = "0", contactoId?: bigint) {
  return {
    turnoId: String(turnoId), contactoId: contactoId ? String(contactoId) : undefined, uuidCliente: randomUUID(), descuento,
    partidas: [{ productoId: String(productoId), cantidad: "1", descuento: "0" }],
    pagos: [{ metodo: "efectivo", monto: total }],
  };
}

async function main() {
  const base = await preparar();
  const cookie = await login();
  const promoSinManual = await json("/api/caja/ventas", "POST", {
    turnoId: String(base.turno.id), uuidCliente: randomUUID(), descuento: "0",
    partidas: [{ productoId: String(base.promo.id), cantidad: "3", descuento: "0" }], pagos: [{ metodo: "efectivo", monto: "200" }],
  }, cookie);
  const promoConQuince = await json("/api/caja/ventas", "POST", {
    turnoId: String(base.turno.id), uuidCliente: randomUUID(), descuento: "30",
    partidas: [{ productoId: String(base.promo.id), cantidad: "3", descuento: "0" }], pagos: [{ metodo: "efectivo", monto: "170" }],
  }, cookie);
  assert.equal(promoSinManual.respuesta.status, 201, JSON.stringify(promoSinManual.data));
  assert.equal(promoConQuince.respuesta.status, 403, JSON.stringify(promoConQuince.data));

  const caja = await json("/api/caja/ventas", "POST", ventaCaja(base.turno.id, base.publico.id, "80"), cookie);
  const cajaClienteSinLista = await json("/api/caja/ventas", "POST", ventaCaja(base.turno.id, base.publico.id, "80", "0", base.contacto.id), cookie);
  const ventas = await json("/api/ventas", "POST", { estado: "pendiente", canal: "mostrador", descuento: "0", partidas: [{ productoId: String(base.publico.id), cantidad: "1" }] }, cookie);
  const tienda = await json(`/api/public/tienda/${slug}`, "POST", { uuidCliente: randomUUID(), nombre: "Cliente web", telefono: "5512345678", tipoEntrega: "recoger", partidas: [{ productoId: String(base.publico.id), cantidad: "1" }] });
  assert.deepEqual([caja.respuesta.status, cajaClienteSinLista.respuesta.status, ventas.respuesta.status, tienda.respuesta.status], [201, 201, 201, 201]);
  assert.deepEqual([caja.data.venta.total, cajaClienteSinLista.data.venta.total, ventas.data.venta.total, tienda.data.total], ["80", "80", "80", "80.00"]);
  const costos = await transaccionTenant(orgId, async (tx) => ({
    caja: await tx.ventaPartida.findFirstOrThrow({ where: { ventaId: BigInt(caja.data.venta.id) }, select: { costoUnitario: true } }),
    ventas: await tx.ventaPartida.findFirstOrThrow({ where: { ventaId: BigInt(ventas.data.venta.id) }, select: { costoUnitario: true } }),
    pedidoPendiente: await tx.ventaPartida.findFirstOrThrow({ where: { venta: { tokenSeguimiento: tienda.data.token } }, select: { costoUnitario: true } }),
  }));
  assert.equal(costos.caja.costoUnitario?.toFixed(2), "30.00");
  assert.equal(costos.ventas.costoUnitario?.toFixed(2), "30.00");
  assert.equal(costos.pedidoPendiente.costoUnitario, null);

  console.log(JSON.stringify({
    descuentoCajero: { promocionSinManual: promoSinManual.respuesta.status, promocionMasQuinceManual: promoConQuince.respuesta.status },
    listaPublica: { caja: caja.data.venta.total, cajaClienteSinLista: cajaClienteSinLista.data.venta.total, ventas: ventas.data.venta.total, tienda: tienda.data.total },
    costoUnitario: { caja: costos.caja.costoUnitario?.toFixed(2), ventas: costos.ventas.costoUnitario?.toFixed(2), pedidoPendiente: null },
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
