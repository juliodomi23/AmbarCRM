import assert from "node:assert/strict";
import pg from "pg";
import { Prisma } from "@prisma/client";
import { crearCotizacion, responderCotizacion } from "../../src/lib/cotizaciones-db";
import { dbRaw } from "../../src/lib/db";
import { bloquearProductos, transaccionTenant } from "../../src/lib/retail-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sinProteccion = process.env.COTIZACION_SIN_PROTECCION === "1";
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 971n;
const pausa = () => new Promise((resolve) => setTimeout(resolve, 180));

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Concurrencia cotización', $2)", [orgId.toString(), `cotizacion-${sufijo}`]);
  const base = await transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.createMany({ data: [{ clave: "cotizaciones", activo: true, config: { ivaPorcentaje: "16", preciosConIva: false } }, { clave: "ventas", activo: true, config: {} }] });
    const usuario = await tx.usuario.create({ data: { nombre: "Cotizador", email: `cotizador-${sufijo}@test.local`, passwordHash: "sin-login" } });
    const contacto = await tx.contacto.create({ data: { nombre: "Cliente concurrente", telefono: `963${String(Date.now()).slice(-7)}` } });
    const producto = await tx.producto.create({ data: { sku: `COT-${sufijo}`, nombre: "Producto cotizado", precio: 100, stock: 0 } });
    await bloquearProductos(tx, [producto.id]);
    await tx.producto.update({ where: { id: producto.id }, data: { stock: 2 } });
    return { usuario, contacto, producto };
  });
  const cotizacion = await crearCotizacion(orgId, base.usuario.id, {
    contactoId: base.contacto.id, oportunidadId: null, vigencia: new Date(Date.now() + 86400000), descuentoGeneral: new Prisma.Decimal(0),
    convertirVenta: true, notas: null, condiciones: null,
    partidas: [{ productoId: base.producto.id, concepto: base.producto.nombre, cantidad: new Prisma.Decimal(1), precio: null, descuento: new Prisma.Decimal(0) }],
  });
  return { ...base, cotizacion };
}

async function aceptarSinBloqueo(token: string, productoId: bigint, indice: number) {
  return transaccionTenant(orgId, async (tx) => {
    const cotizacion = await tx.cotizacion.findUniqueOrThrow({ where: { tokenPublico: token }, include: { partidas: true } });
    if (cotizacion.estado !== "borrador") throw new Error("ya respondida");
    await pausa();
    await bloquearProductos(tx, [productoId]);
    const producto = await tx.producto.findUniqueOrThrow({ where: { id: productoId } });
    if (producto.stock.lt(1)) throw new Error("sin stock");
    const venta = await tx.venta.create({ data: { folio: `NP-COT-${indice}-${sufijo}`, contactoId: cotizacion.contactoId, creadoPorId: cotizacion.creadoPorId, estado: "pendiente", canal: "cotizacion", subtotal: cotizacion.subtotal, descuento: cotizacion.descuento, total: cotizacion.total, stockAplicado: true } });
    const partida = cotizacion.partidas[0];
    await tx.ventaPartida.create({ data: { ventaId: venta.id, productoId, cantidad: partida.cantidad, precioUnitario: partida.precio, descuento: partida.descuento, total: partida.total } });
    const existenciaDespues = producto.stock.minus(1);
    await tx.producto.update({ where: { id: producto.id }, data: { stock: existenciaDespues } });
    await tx.movimientoInventario.create({ data: { productoId, ventaId: venta.id, usuarioId: cotizacion.creadoPorId, tipo: "venta", cantidad: -1, existenciaAntes: producto.stock, existenciaDespues, motivo: `Aceptación sin bloqueo ${indice}` } });
    await tx.cotizacion.update({ where: { id: cotizacion.id }, data: { estado: "aceptada", ventaId: venta.id, respondidoPor: `Persona ${indice}`, respondidoAt: new Date(), respondidoIp: `127.0.0.${indice}`, version: { increment: 1 } } });
    return { repetida: false };
  });
}

async function main() {
  const base = await preparar();
  const aceptar = sinProteccion
    ? (indice: number) => aceptarSinBloqueo(base.cotizacion.tokenPublico, base.producto.id, indice)
    : (indice: number) => responderCotizacion(orgId, base.cotizacion.tokenPublico, { accion: "aceptar", nombre: `Persona ${indice}`, ip: `127.0.0.${indice}` });
  const intentos = await Promise.allSettled([aceptar(1), aceptar(2)]);
  const estado = await transaccionTenant(orgId, async (tx) => ({
    cotizacion: await tx.cotizacion.findUniqueOrThrow({ where: { id: base.cotizacion.id } }),
    ventas: await tx.venta.count({ where: { canal: "cotizacion" } }),
    stock: (await tx.producto.findUniqueOrThrow({ where: { id: base.producto.id } })).stock,
  }));
  const repetidas = intentos.filter((intento) => intento.status === "fulfilled" && intento.value.repetida).length;
  const resultado = {
    modo: sinProteccion ? "SIN_PROTECCION" : "CON_PROTECCION",
    peticiones: 2,
    respuestasExitosas: intentos.filter((intento) => intento.status === "fulfilled").length,
    aceptacionesNuevas: estado.cotizacion.version - 1,
    respuestasIdempotentes: repetidas,
    ventasCreadas: estado.ventas,
    stockFinal: Number(estado.stock),
  };
  if (!sinProteccion) {
    assert.equal(resultado.respuestasExitosas, 2);
    assert.equal(resultado.aceptacionesNuevas, 1);
    assert.equal(resultado.respuestasIdempotentes, 1);
    assert.equal(resultado.ventasCreadas, 1);
    assert.equal(resultado.stockFinal, 1);
  }
  console.log(JSON.stringify(resultado));
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    const tablas = await admin.query<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id'");
    for (const { table_name } of tablas.rows) await admin.query(`DELETE FROM "${table_name.replaceAll('"', '""')}" WHERE org_id = $1`, [orgId.toString()]);
    await admin.query("DELETE FROM orgs WHERE id = $1", [orgId.toString()]);
  } finally { await admin.query("SET session_replication_role = origin"); }
}

main().catch((error) => { console.error("FALLO:", error); process.exitCode = 1; }).finally(async () => {
  await limpiar().catch((error) => console.error("No se pudo limpiar:", error));
  await Promise.all([dbRaw.$disconnect(), admin.end()]);
});
