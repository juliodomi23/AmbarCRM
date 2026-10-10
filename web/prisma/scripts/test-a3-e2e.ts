import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import pg from "pg";
import { dbRaw } from "../../src/lib/db";
import { bloquearProductos, transaccionTenant } from "../../src/lib/retail-db";
import { toCSV } from "../../src/lib/csv";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3118";
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 994n;
const otraOrgId = orgId + 1n;
const slug = `a3-e2e-${sufijo}`;
const email = `a3-${sufijo}@test.local`;
const password = "A3-E2E-2026!";

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
    method: "POST",
    redirect: "manual",
    headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: token, email, password, orgSlug: slug, callbackUrl: `${baseUrl}/productos`, json: "true" }),
  });
  cookie = combinarCookies(cookie, cookiesDe(respuesta));
  assert.match(cookie, /next-auth\.session-token/);
  return cookie;
}

async function json(ruta: string, method: string, body: unknown, cookie: string) {
  const respuesta = await fetch(`${baseUrl}${ruta}`, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { respuesta, data: await respuesta.json().catch(() => ({})) };
}

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'A3 E2E', $2), ($3, 'A3 ajena', $4)", [String(orgId), slug, String(otraOrgId), `${slug}-otra`]);
  const propio = await transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.createMany({ data: [
      { clave: "productos", activo: true, config: {} },
      { clave: "ventas", activo: true, config: {} },
      { clave: "pedidos_en_linea", activo: true, config: { maxPorTelefono: 10, maxPorIp: 10 } },
    ] });
    await tx.usuario.create({ data: { nombre: "Admin A3", email, passwordHash: await bcrypt.hash(password, 10), rol: "admin", puesto: "Administrador" } });
    const producto = await tx.producto.create({ data: { sku: `EXIST-${sufijo}`.toUpperCase(), nombre: "Existente", precio: 10 } });
    await bloquearProductos(tx, [producto.id]);
    return tx.producto.update({ where: { id: producto.id }, data: { stock: 7 } });
  });
  const ajeno = await transaccionTenant(otraOrgId, (tx) => tx.producto.create({ data: { sku: `AJENO-${sufijo}`, nombre: "Ajeno", precio: 10 } }));
  return { propio, ajeno };
}

async function main() {
  const base = await preparar();
  const cookie = await login();
  const padreSku = `PADRE-${sufijo}`.toUpperCase();
  const varianteSku = `VAR-${sufijo}`.toUpperCase();
  const csv = toCSV(
    ["sku", "nombre", "codigo_barras", "precio", "costo", "unidad", "activo", "grupo_sku", "atributos"],
    [
      [base.propio.sku, "Existente actualizado", "", "22.50", "3", "pieza", "sí", "", "{}"],
      [padreSku, "Playera", `P-${sufijo}`, "100", "40", "pieza", "sí", "", "{}"],
      [varianteSku, "Playera roja M", `V-${sufijo}`, "110", "45", "pieza", "sí", padreSku, JSON.stringify({ color: "rojo", talla: "M" })],
    ],
  );
  const importar = await json("/api/productos/importar", "POST", { csv }, cookie);
  assert.equal(importar.respuesta.status, 200, JSON.stringify(importar.data));
  assert.deepEqual({ creados: importar.data.creados, actualizados: importar.data.actualizados }, { creados: 2, actualizados: 1 });

  const estadoImportado = await transaccionTenant(orgId, async (tx) => {
    const existente = await tx.producto.findUniqueOrThrow({ where: { id: base.propio.id } });
    const padre = await tx.producto.findUniqueOrThrow({ where: { orgId_sku: { orgId, sku: padreSku } } });
    const variante = await tx.producto.findUniqueOrThrow({ where: { orgId_sku: { orgId, sku: varianteSku } }, include: { grupo: true } });
    return { existente, padre, variante };
  });
  assert.equal(estadoImportado.existente.stock.toFixed(3), "7.000", "importar no toca existencia");
  assert.equal(estadoImportado.variante.grupoId, estadoImportado.padre.id);
  assert.deepEqual(estadoImportado.variante.atributos, { color: "rojo", talla: "M" });
  assert.equal(estadoImportado.variante.stock.toFixed(3), "0.000", "cada variante tiene existencia propia");

  const duplicado = toCSV(["sku", "nombre", "precio"], [["DUP", "Uno", 1], ["DUP", "Dos", 2]]);
  const importarDuplicado = await json("/api/productos/importar", "POST", { csv: duplicado }, cookie);
  assert.equal(importarDuplicado.respuesta.status, 400);
  assert.deepEqual(importarDuplicado.data.errores.map((error: { linea: number }) => error.linea), [3]);

  const lote = await json("/api/productos/lote", "PATCH", { productos: [{ id: String(base.propio.id), precio: "30", agotadoManual: true }] }, cookie);
  assert.equal(lote.respuesta.status, 200, JSON.stringify(lote.data));
  const loteAjeno = await json("/api/productos/lote", "PATCH", { productos: [{ id: String(base.ajeno.id), precio: "1" }] }, cookie);
  assert.equal(loteAjeno.respuesta.status, 404);
  const despuesLote = await transaccionTenant(orgId, (tx) => tx.producto.findUniqueOrThrow({ where: { id: base.propio.id } }));
  assert.equal(despuesLote.precio.toFixed(2), "30.00");
  assert.equal(despuesLote.stock.toFixed(3), "7.000", "el lote no toca existencia");

  await transaccionTenant(orgId, async (tx) => {
    await bloquearProductos(tx, [estadoImportado.variante.id]);
    await tx.producto.update({ where: { id: estadoImportado.variante.id }, data: { stock: 1, visibleEnLinea: true } });
  });
  const [pedidoVariante, ventaVariante] = await Promise.all([
    json(`/api/public/tienda/${slug}`, "POST", {
      uuidCliente: crypto.randomUUID(), nombre: "Cliente variante", telefono: "5512345678", tipoEntrega: "recoger",
      partidas: [{ productoId: String(estadoImportado.variante.id), cantidad: "1" }],
    }, ""),
    json("/api/ventas", "POST", { estado: "pendiente", canal: "mostrador", descuento: "0", partidas: [{ productoId: String(estadoImportado.variante.id), cantidad: "1" }] }, cookie),
  ]);
  const codigosConcurrencia = [pedidoVariante.respuesta.status, ventaVariante.respuesta.status];
  assert.equal(codigosConcurrencia.filter((codigo) => codigo === 201).length, 1, JSON.stringify({ pedido: pedidoVariante.data, venta: ventaVariante.data }));
  assert.equal(codigosConcurrencia.filter((codigo) => codigo >= 400).length, 1, JSON.stringify({ pedido: pedidoVariante.data, venta: ventaVariante.data }));
  const inventarioVariante = await transaccionTenant(orgId, async (tx) => ({
    stock: (await tx.producto.findUniqueOrThrow({ where: { id: estadoImportado.variante.id } })).stock,
    reservado: (await tx.reservaPedido.aggregate({ where: { productoId: estadoImportado.variante.id, activa: true }, _sum: { cantidad: true } }))._sum.cantidad,
  }));
  assert.equal(inventarioVariante.stock.minus(inventarioVariante.reservado ?? 0).toFixed(3), "0.000");

  await transaccionTenant(orgId, (tx) => tx.producto.update({ where: { id: base.propio.id }, data: { nombre: "=2+2" } }));
  const exportar = await fetch(`${baseUrl}/api/productos/exportar`, { headers: { Cookie: cookie } });
  const exportado = await exportar.text();
  assert.equal(exportar.status, 200);
  assert.match(exportado, /'=2\+2/, "la exportación debe neutralizar fórmulas");
  assert.match(exportado, new RegExp(varianteSku));

  const codigo = await fetch(`${baseUrl}/api/productos/${estadoImportado.variante.id}/codigo`, { headers: { Cookie: cookie } });
  assert.equal(codigo.status, 200);
  assert.match(codigo.headers.get("content-type") ?? "", /image\/svg\+xml/);
  assert.match(await codigo.text(), /<svg/);
  const [etiquetas, precios] = await Promise.all([
    fetch(`${baseUrl}/productos/etiquetas`, { headers: { Cookie: cookie }, redirect: "manual" }),
    fetch(`${baseUrl}/productos/precios`, { headers: { Cookie: cookie }, redirect: "manual" }),
  ]);
  assert.deepEqual([etiquetas.status, precios.status], [200, 200]);

  console.log(JSON.stringify({
    loginReal: true,
    variantes: { padre: padreSku, variante: varianteSku, atributos: estadoImportado.variante.atributos, existenciasIndependientes: true, concurrenciaPedidoVenta: { pedido: pedidoVariante.respuesta.status, venta: ventaVariante.respuesta.status, existencia: inventarioVariante.stock.toFixed(3), reservada: inventarioVariante.reservado?.toFixed(3) ?? "0.000", disponible: "0.000" } },
    code128: { apiSvg: codigo.status, etiquetas: etiquetas.status },
    csv: { importar: importar.respuesta.status, duplicado: importarDuplicado.respuesta.status, erroresPorRenglon: importarDuplicado.data.errores, formulaProtegida: true, existenciaConservada: despuesLote.stock.toFixed(3) },
    lote: { propio: lote.respuesta.status, ajeno: loteAjeno.respuesta.status, precio: despuesLote.precio.toFixed(2), existenciaConservada: true },
    precios: precios.status,
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

main().catch((error) => { console.error("FALLO:", error); process.exitCode = 1; }).finally(async () => {
  await limpiar().catch(console.error);
  await Promise.all([dbRaw.$disconnect(), admin.end()]);
});
