import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { Prisma } from "@prisma/client";
import { registrarVentaCaja } from "../../src/lib/caja-db";
import { crearApartado, registrarDevolucion, registrarVentaCredito } from "../../src/lib/caja-a2-db";
import { calcularPrecios } from "../../src/lib/precios-db";
import { crearCotizacion, responderCotizacion } from "../../src/lib/cotizaciones-db";
import { crearPedido } from "../../src/lib/pedidos-db";
import { configPedidos } from "../../src/lib/pedidos";
import { dbRaw } from "../../src/lib/db";
import { transaccionTenant } from "../../src/lib/retail-db";
import { cambiarEstadoVenta } from "../../src/lib/venta-estado-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const orgId = BigInt(Date.now()) * 1000n + 993n;
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const actor = { orgId, userId: 0n, rol: "admin", puesto: "Encargado de tienda" };

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Precios A3', $2)", [String(orgId), `precios-${sufijo}`]);
  return transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.createMany({ data: [{ clave: "caja", activo: true, config: {} }, { clave: "ventas", activo: true, config: {} }, { clave: "productos", activo: true, config: {} }, { clave: "pedidos_en_linea", activo: true, config: {} }, { clave: "cotizaciones", activo: true, config: { ivaPorcentaje: 0 } }] });
    const usuario = await tx.usuario.create({ data: { nombre: "Encargada", email: `precios-${sufijo}@test.local`, passwordHash: "x", rol: "admin", puesto: "Encargado de tienda" } });
    actor.userId = usuario.id;
    const caja = await tx.caja.create({ data: { nombre: `Caja ${sufijo}` } });
    const turno = await tx.turnoCaja.create({ data: { cajaId: caja.id, usuarioId: usuario.id, fondoInicial: 0 } });
    const contacto = await tx.contacto.create({ data: { nombre: "Cliente mayoreo", telefono: `55${String(Date.now()).slice(-8)}` } });
    const promo = await tx.producto.create({ data: { sku: `3X2-${sufijo}`, nombre: "Producto 3x2", categoria: "Promo", precio: 100, costo: 40, stock: 30, visibleEnLinea: true } });
    const promoZona = await tx.producto.create({ data: { sku: `ZONA-${sufijo}`, nombre: "Promoción de un día", categoria: "Promo", precio: 100, stock: 30 } });
    const escalas = await tx.producto.create({ data: { sku: `ESC-${sufijo}`, nombre: "Producto escalas", precio: 120, stock: 30, visibleEnLinea: true } });
    const lista = await tx.listaPrecio.create({ data: { nombre: `Mayoreo ${sufijo}`, tipo: "mayoreo" } });
    await tx.contacto.update({ where: { id: contacto.id }, data: { listaPrecioId: lista.id } });
    await tx.listaPrecioProducto.create({ data: { listaId: lista.id, productoId: escalas.id, precio: 95 } });
    await tx.precioVolumen.create({ data: { productoId: escalas.id, desde: 10, precio: 90 } });
    await tx.promocion.create({ data: { nombre: "3x2 octubre", tipo: "nxm", productoId: promo.id, cantidadCompra: 3, cantidadPaga: 2, inicia: new Date("2026-01-01T12:00:00Z"), termina: new Date("2026-12-31T12:00:00Z") } });
    await tx.promocion.create({ data: { nombre: "Promoción local", tipo: "nxm", productoId: promoZona.id, cantidadCompra: 3, cantidadPaga: 2, inicia: new Date("2026-10-09T12:00:00Z"), termina: new Date("2026-10-09T12:00:00Z") } });
    return { turno, contacto, promo, promoZona, escalas };
  });
}

async function vender(productoId: bigint, turnoId: bigint, contactoId: bigint, descuento: string) {
  return registrarVentaCaja(actor, {
    turnoId,
    contactoId,
    uuidCliente: randomUUID(),
    descuento: new Prisma.Decimal(descuento),
    notas: null,
    partidas: [{ productoId, cantidad: new Prisma.Decimal(3), descuento: new Prisma.Decimal(0) }],
    pagos: [{ metodo: "efectivo", monto: new Prisma.Decimal(descuento === "0" ? 200 : 180) }],
  });
}

async function devolverUna(ventaId: bigint, partidaId: bigint) {
  return registrarDevolucion(actor, { ventaId, ventaCambioId: null, tipoReembolso: "efectivo", motivo: "Prueba A3", partidas: [{ ventaPartidaId: partidaId, cantidad: new Prisma.Decimal(1) }] });
}

async function main() {
  const base = await preparar();
  const reglas = await transaccionTenant(orgId, async (tx) => {
    const lista = await calcularPrecios(tx, [{ productoId: base.escalas.id, cantidad: new Prisma.Decimal(1) }], { contactoId: base.contacto.id });
    const volumen = await calcularPrecios(tx, [{ productoId: base.escalas.id, cantidad: new Prisma.Decimal(10) }], { contactoId: base.contacto.id });
    const ultimoDia = await calcularPrecios(tx, [{ productoId: base.promoZona.id, cantidad: new Prisma.Decimal(3) }], { ahora: new Date("2026-10-10T02:00:00Z") });
    const siguienteDia = await calcularPrecios(tx, [{ productoId: base.promoZona.id, cantidad: new Prisma.Decimal(3) }], { ahora: new Date("2026-10-10T06:01:00Z") });
    return { lista: lista[0], volumen: volumen[0], ultimoDia: ultimoDia[0], siguienteDia: siguienteDia[0] };
  });
  assert.equal(reglas.lista.precioUnitario.toFixed(2), "95.00");
  assert.equal(reglas.volumen.precioUnitario.toFixed(2), "90.00");
  assert.equal(reglas.ultimoDia.total.toFixed(2), "200.00");
  assert.equal(reglas.siguienteDia.total.toFixed(2), "300.00");

  const venta = await vender(base.promo.id, base.turno.id, base.contacto.id, "0");
  const partida = venta.venta.partidas[0];
  assert.equal(venta.venta.total.toFixed(2), "200.00");
  assert.equal(partida.descuentoPromocion.toFixed(2), "100.00");
  assert.equal(partida.promocionDescripcion, "3x2 octubre");
  assert.equal(partida.costoUnitario?.toFixed(2), "40.00");
  const devoluciones = [await devolverUna(venta.venta.id, partida.id), await devolverUna(venta.venta.id, partida.id), await devolverUna(venta.venta.id, partida.id)];
  const totalDevuelto = devoluciones.reduce((suma, devolucion) => suma.plus(devolucion.total), new Prisma.Decimal(0));
  assert.equal(totalDevuelto.toFixed(2), "200.00");

  const combinada = await vender(base.promo.id, base.turno.id, base.contacto.id, "20");
  const partidaCombinada = combinada.venta.partidas[0];
  const devolucionesCombinadas = [await devolverUna(combinada.venta.id, partidaCombinada.id), await devolverUna(combinada.venta.id, partidaCombinada.id), await devolverUna(combinada.venta.id, partidaCombinada.id)];
  const totalCombinado = devolucionesCombinadas.reduce((suma, devolucion) => suma.plus(devolucion.total), new Prisma.Decimal(0));
  assert.equal(combinada.venta.total.toFixed(2), "180.00");
  assert.equal(totalCombinado.toFixed(2), "180.00");

  const uuidApartado = randomUUID();
  await crearApartado(actor, { turnoId: base.turno.id, contactoId: base.contacto.id, uuidCliente: uuidApartado, anticipo: new Prisma.Decimal(50), metodo: "efectivo", notas: null, partidas: [{ productoId: base.promo.id, cantidad: new Prisma.Decimal(3), descuento: new Prisma.Decimal(0) }] });
  const apartado = await transaccionTenant(orgId, (tx) => tx.venta.findFirstOrThrow({ where: { uuidCliente: uuidApartado }, include: { partidas: true } }));
  assert.equal(apartado.total.toFixed(2), "200.00");
  assert.equal(apartado.partidas[0].costoUnitario?.toFixed(2), "40.00");

  await transaccionTenant(orgId, (tx) => tx.cuentaCliente.create({ data: { contactoId: base.contacto.id, limiteCredito: 1000 } }));
  const credito = await registrarVentaCredito(actor, { turnoId: base.turno.id, contactoId: base.contacto.id, uuidCliente: randomUUID(), descuento: new Prisma.Decimal(0), notas: null, partidas: [{ productoId: base.promo.id, cantidad: new Prisma.Decimal(3), descuento: new Prisma.Decimal(0) }] });
  assert.equal(credito.venta.total.toFixed(2), "200.00");
  assert.equal(credito.venta.partidas[0].costoUnitario?.toFixed(2), "40.00");

  const cotizacion = await crearCotizacion(orgId, actor.userId, { contactoId: base.contacto.id, oportunidadId: null, vigencia: new Date("2026-10-15T12:00:00Z"), descuentoGeneral: new Prisma.Decimal(0), convertirVenta: false, notas: null, condiciones: null, partidas: [{ productoId: base.promo.id, concepto: "ignorado", cantidad: new Prisma.Decimal(3), precio: null, descuento: new Prisma.Decimal(0) }] });
  assert.equal(cotizacion.total.toFixed(2), "200.00");
  assert.equal(cotizacion.partidas[0].descuentoPromocion.toFixed(2), "100.00");
  await transaccionTenant(orgId, (tx) => tx.promocion.updateMany({ where: { productoId: base.promo.id }, data: { activa: false } }));
  const cotizacionConPrecioConservado = await transaccionTenant(orgId, (tx) => tx.cotizacion.findUniqueOrThrow({ where: { id: cotizacion.id }, include: { partidas: true } }));
  assert.equal(cotizacionConPrecioConservado.total.toFixed(2), "200.00", "una cotización creada conserva sus precios");
  await transaccionTenant(orgId, (tx) => tx.promocion.updateMany({ where: { productoId: base.promo.id }, data: { activa: true } }));

  const cotizacionVenta = await crearCotizacion(orgId, actor.userId, { contactoId: base.contacto.id, oportunidadId: null, vigencia: new Date("2026-12-31T12:00:00Z"), descuentoGeneral: new Prisma.Decimal(0), convertirVenta: true, notas: null, condiciones: null, partidas: [{ productoId: base.promo.id, concepto: "ignorado", cantidad: new Prisma.Decimal(3), precio: null, descuento: new Prisma.Decimal(0) }] });
  const aceptada = await responderCotizacion(orgId, cotizacionVenta.tokenPublico, { accion: "aceptar", nombre: "Cliente", ip: "127.0.0.1", ahora: new Date("2026-10-10T12:00:00Z") });
  const partidaCotizacion = await transaccionTenant(orgId, (tx) => tx.ventaPartida.findFirstOrThrow({ where: { ventaId: aceptada.cotizacion.ventaId! } }));
  assert.equal(partidaCotizacion.costoUnitario?.toFixed(2), "40.00");

  const pedido = await crearPedido(orgId, configPedidos({ maxPorTelefono: 10, maxPorIp: 10 }), { uuidCliente: randomUUID(), nombre: "Cliente web", telefono10: "5551234567", ip: "127.0.0.55", tipoEntrega: "recoger", direccion: null, horarioDeseado: null, notas: null, partidas: [{ productoId: base.promo.id, cantidad: new Prisma.Decimal(3) }] });
  assert.equal(pedido.venta.total.toFixed(2), "200.00");
  const pedidoPendiente = await transaccionTenant(orgId, (tx) => tx.ventaPartida.findFirstOrThrow({ where: { ventaId: pedido.venta.id } }));
  assert.equal(pedidoPendiente.costoUnitario, null);
  await cambiarEstadoVenta(actor, pedido.venta.id, "preparando");
  const pedidoConfirmado = await transaccionTenant(orgId, (tx) => tx.ventaPartida.findFirstOrThrow({ where: { ventaId: pedido.venta.id } }));
  assert.equal(pedidoConfirmado.costoUnitario?.toFixed(2), "40.00");

  console.log(JSON.stringify({
    prioridad: { listaCliente: reglas.lista.precioUnitario.toFixed(2), volumen: reglas.volumen.precioUnitario.toFixed(2) },
    vigenciaMexico: { ultimoDia20h: reglas.ultimoDia.total.toFixed(2), diaSiguiente0001: reglas.siguienteDia.total.toFixed(2) },
    tresPorDos: { cobrado: venta.venta.total.toFixed(2), devoluciones: devoluciones.map((d) => d.total.toFixed(2)), totalDevuelto: totalDevuelto.toFixed(2) },
    promocionMasDescuentoGeneral: { cobrado: combinada.venta.total.toFixed(2), totalDevuelto: totalCombinado.toFixed(2), noSuperaCobrado: totalCombinado.lte(combinada.venta.total) },
    caminos: { caja: venta.venta.total.toFixed(2), apartado: apartado.total.toFixed(2), credito: credito.venta.total.toFixed(2), cotizacion: cotizacion.total.toFixed(2), cotizacionConservada: cotizacionConPrecioConservado.total.toFixed(2), tienda: pedido.venta.total.toFixed(2) },
    costosHistoricos: { caja: partida.costoUnitario?.toFixed(2), apartado: apartado.partidas[0].costoUnitario?.toFixed(2), credito: credito.venta.partidas[0].costoUnitario?.toFixed(2), cotizacionAceptada: partidaCotizacion.costoUnitario?.toFixed(2), pedidoAntes: null, pedidoConfirmado: pedidoConfirmado.costoUnitario?.toFixed(2) },
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
