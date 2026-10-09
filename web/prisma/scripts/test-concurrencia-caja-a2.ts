import assert from "node:assert/strict";
import pg from "pg";
import { Prisma } from "@prisma/client";
import { dbRaw } from "../../src/lib/db";
import {
  cancelarApartado,
  crearApartado,
  registrarDevolucion,
  registrarVentaCredito,
  vencerApartados,
} from "../../src/lib/caja-a2-db";
import { abrirTurnoCaja, cerrarTurnoCaja, registrarVentaCaja } from "../../src/lib/caja-db";
import { bloquearProductos, transaccionTenant } from "../../src/lib/retail-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sinProteccion = process.env.CAJA_A2_SIN_PROTECCION === "1";
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 823n;
const pausa = () => new Promise((resolve) => setTimeout(resolve, 120));
const actor = { userId: 0n, orgId, rol: "agente" as const, puesto: "Cajero" };

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Concurrencia caja A2', $2)", [orgId.toString(), `caja-a2-${sufijo}`]);
  return transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.create({ data: { clave: "caja", activo: true, config: { apartadoDiasVigencia: 7 } } });
    const usuario = await tx.usuario.create({ data: { nombre: "Cajero A2", email: `cajero-a2-${sufijo}@test.local`, passwordHash: "no-login", puesto: "Cajero" } });
    actor.userId = usuario.id;
    const cajas = await Promise.all(["Original", "Actual", "Crédito", "Apartado"].map((nombre) => tx.caja.create({ data: { nombre: `${nombre}-${sufijo}` } })));
    const contacto = await tx.contacto.create({ data: { nombre: "Cliente A2", telefono: `961${String(Date.now()).slice(-7)}` } });
    const productos = await Promise.all([
      tx.producto.create({ data: { sku: `DEV-${sufijo}`, nombre: "Producto devolución", precio: 100, stock: 0 } }),
      tx.producto.create({ data: { sku: `CRE-${sufijo}`, nombre: "Producto crédito", precio: 80, stock: 0 } }),
      tx.producto.create({ data: { sku: `APA-${sufijo}`, nombre: "Producto apartado", precio: 120, stock: 0 } }),
      tx.producto.create({ data: { sku: `VEN-${sufijo}`, nombre: "Producto que vence", precio: 90, stock: 0 } }),
    ]);
    await bloquearProductos(tx, productos.map((producto) => producto.id));
    await tx.producto.update({ where: { id: productos[0].id }, data: { stock: 1 } });
    await tx.producto.update({ where: { id: productos[1].id }, data: { stock: 2 } });
    await tx.producto.update({ where: { id: productos[2].id }, data: { stock: 1 } });
    await tx.producto.update({ where: { id: productos[3].id }, data: { stock: 1 } });
    await tx.cuentaCliente.create({ data: { contactoId: contacto.id, limiteCredito: 100, saldo: 0 } });
    return { usuario, cajas, contacto, productos };
  });
}

async function devolverSinBloquearVenta(ventaId: bigint, ventaPartidaId: bigint, productoId: bigint, contactoId: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    const partida = await tx.ventaPartida.findUniqueOrThrow({ where: { id: ventaPartidaId } });
    const previas = await tx.devolucionPartida.aggregate({ where: { ventaPartidaId }, _sum: { cantidad: true } });
    if ((previas._sum.cantidad ?? new Prisma.Decimal(0)).plus(1).gt(partida.cantidad)) throw new Error("excede venta");
    await pausa();
    await bloquearProductos(tx, [productoId]);
    const producto = await tx.producto.findUniqueOrThrow({ where: { id: productoId } });
    const devolucion = await tx.devolucionVenta.create({ data: { ventaOriginalId: ventaId, usuarioId: actor.userId, tipoReembolso: "nota_credito", total: 100 } });
    await tx.devolucionPartida.create({ data: { devolucionId: devolucion.id, ventaPartidaId, cantidad: 1, monto: 100 } });
    await tx.notaCreditoCliente.create({ data: { contactoId, devolucionId: devolucion.id, montoOriginal: 100, saldo: 100 } });
    await tx.producto.update({ where: { id: productoId }, data: { stock: producto.stock.plus(1) } });
    return devolucion;
  });
}

async function venderCreditoSinBloquearCuenta(turnoId: bigint, contactoId: bigint, productoId: bigint, uuidCliente: string) {
  return transaccionTenant(orgId, async (tx) => {
    const [turno, cuenta, producto] = await Promise.all([
      tx.turnoCaja.findUniqueOrThrow({ where: { id: turnoId } }),
      tx.cuentaCliente.findUniqueOrThrow({ where: { contactoId } }),
      tx.producto.findUniqueOrThrow({ where: { id: productoId } }),
    ]);
    const total = new Prisma.Decimal(80);
    if (cuenta.saldo.plus(total).gt(cuenta.limiteCredito)) throw new Error("límite excedido");
    await pausa();
    await bloquearProductos(tx, [productoId]);
    const actual = await tx.producto.findUniqueOrThrow({ where: { id: productoId } });
    const venta = await tx.venta.create({ data: { folio: `U-${crypto.randomUUID()}`, turnoId, cajaId: turno.cajaId, contactoId, creadoPorId: actor.userId, uuidCliente, estado: "pendiente", metodoPago: "credito", subtotal: total, total, stockAplicado: true, esCredito: true } });
    await tx.ventaPartida.create({ data: { ventaId: venta.id, productoId, cantidad: 1, precioUnitario: 80, total } });
    await tx.producto.update({ where: { id: productoId }, data: { stock: actual.stock.minus(1) } });
    await tx.cuentaCliente.update({ where: { id: cuenta.id }, data: { saldo: cuenta.saldo.plus(total) } });
    await tx.movimientoCuentaCliente.create({ data: { cuentaId: cuenta.id, ventaId: venta.id, turnoId, usuarioId: actor.userId, tipo: "cargo", monto: total, saldoAntes: cuenta.saldo, saldoDespues: cuenta.saldo.plus(total) } });
    return venta;
  });
}

async function main() {
  const base = await preparar();
  const turnoOriginal = await abrirTurnoCaja(actor, { cajaId: base.cajas[0].id, fondoInicial: new Prisma.Decimal(200) });
  const ventaOriginal = await registrarVentaCaja(actor, {
    turnoId: turnoOriginal.id,
    contactoId: base.contacto.id,
    uuidCliente: `original-${sufijo}`,
    descuento: new Prisma.Decimal(0),
    notas: null,
    partidas: [{ productoId: base.productos[0].id, cantidad: new Prisma.Decimal(1), descuento: new Prisma.Decimal(0) }],
    pagos: [{ metodo: "efectivo", monto: new Prisma.Decimal(100) }],
  });
  await cerrarTurnoCaja(actor, turnoOriginal.id, new Prisma.Decimal(300));
  const turnoActual = await abrirTurnoCaja(actor, { cajaId: base.cajas[1].id, fondoInicial: new Prisma.Decimal(50) });
  const partidaOriginal = ventaOriginal.venta.partidas[0];

  const devolver = sinProteccion
    ? () => devolverSinBloquearVenta(ventaOriginal.venta.id, partidaOriginal.id, partidaOriginal.productoId, base.contacto.id)
    : () => registrarDevolucion(actor, { ventaId: ventaOriginal.venta.id, ventaCambioId: null, tipoReembolso: "nota_credito", motivo: null, partidas: [{ ventaPartidaId: partidaOriginal.id, cantidad: new Prisma.Decimal(1) }] });
  const devoluciones = await Promise.allSettled([devolver(), devolver()]);
  const cantidadDevuelta = await transaccionTenant(orgId, async (tx) => (
    await tx.devolucionPartida.aggregate({ where: { ventaPartidaId: partidaOriginal.id }, _sum: { cantidad: true } })
  )._sum.cantidad ?? new Prisma.Decimal(0));

  const devolucionEfectivo = sinProteccion ? null : await registrarVentaCaja(actor, {
    turnoId: turnoActual.id,
    contactoId: base.contacto.id,
    uuidCliente: `efectivo-${sufijo}`,
    descuento: new Prisma.Decimal(0),
    notas: null,
    partidas: [{ productoId: base.productos[0].id, cantidad: new Prisma.Decimal(1), descuento: new Prisma.Decimal(0) }],
    pagos: [{ metodo: "efectivo", monto: new Prisma.Decimal(100) }],
  }).then((resultado) => registrarDevolucion(actor, { ventaId: resultado.venta.id, ventaCambioId: null, tipoReembolso: "efectivo", motivo: null, partidas: [{ ventaPartidaId: resultado.venta.partidas[0].id, cantidad: new Prisma.Decimal(1) }] }));
  const movimientosTurnos = await transaccionTenant(orgId, async (tx) => ({
    original: await tx.movimientoCaja.count({ where: { turnoId: turnoOriginal.id, tipo: "salida" } }),
    actual: await tx.movimientoCaja.count({ where: { turnoId: turnoActual.id, tipo: "salida" } }),
  }));

  const turnoCredito = await abrirTurnoCaja({ ...actor, userId: base.usuario.id }, { cajaId: base.cajas[2].id, fondoInicial: new Prisma.Decimal(0) }).catch(() => turnoActual);
  const venderCredito = sinProteccion
    ? (uuid: string) => venderCreditoSinBloquearCuenta(turnoCredito.id, base.contacto.id, base.productos[1].id, uuid)
    : (uuid: string) => registrarVentaCredito(actor, { turnoId: turnoCredito.id, contactoId: base.contacto.id, uuidCliente: uuid, descuento: new Prisma.Decimal(0), notas: null, partidas: [{ productoId: base.productos[1].id, cantidad: new Prisma.Decimal(1), descuento: new Prisma.Decimal(0) }] });
  const creditos = await Promise.allSettled([venderCredito(`credito-a-${sufijo}`), venderCredito(`credito-b-${sufijo}`)]);
  const estadoCredito = await transaccionTenant(orgId, async (tx) => ({
    ventas: await tx.venta.count({ where: { contactoId: base.contacto.id, esCredito: true } }),
    total: (await tx.venta.aggregate({ where: { contactoId: base.contacto.id, esCredito: true }, _sum: { total: true } }))._sum.total ?? new Prisma.Decimal(0),
    cuenta: await tx.cuentaCliente.findUniqueOrThrow({ where: { contactoId: base.contacto.id } }),
  }));

  let apartadoResultado = null;
  if (!sinProteccion) {
    const apartado = await crearApartado(actor, { turnoId: turnoActual.id, contactoId: base.contacto.id, uuidCliente: `apartado-${sufijo}`, anticipo: new Prisma.Decimal(20), metodo: "efectivo", notas: null, partidas: [{ productoId: base.productos[2].id, cantidad: new Prisma.Decimal(1), descuento: new Prisma.Decimal(0) }] });
    const reservado = await transaccionTenant(orgId, (tx) => tx.producto.findUniqueOrThrow({ where: { id: base.productos[2].id } }));
    await cancelarApartado(actor, apartado.apartado.id, "sin_reembolso");
    const liberado = await transaccionTenant(orgId, (tx) => tx.producto.findUniqueOrThrow({ where: { id: base.productos[2].id } }));
    const vence = await crearApartado(actor, { turnoId: turnoActual.id, contactoId: base.contacto.id, uuidCliente: `vence-${sufijo}`, anticipo: new Prisma.Decimal(10), metodo: "tarjeta", notas: null, partidas: [{ productoId: base.productos[3].id, cantidad: new Prisma.Decimal(1), descuento: new Prisma.Decimal(0) }] });
    await transaccionTenant(orgId, (tx) => tx.apartado.update({ where: { id: vence.apartado.id }, data: { venceAt: new Date(Date.now() - 60_000) } }));
    const vencidos = await vencerApartados(actor);
    const trasVencer = await transaccionTenant(orgId, (tx) => tx.producto.findUniqueOrThrow({ where: { id: base.productos[3].id } }));
    apartadoResultado = { stockReservado: Number(reservado.stock), stockLiberado: Number(liberado.stock), vencidos, stockTrasVencer: Number(trasVencer.stock) };
  }

  const resultado = {
    modo: sinProteccion ? "SIN_PROTECCION" : "CON_PROTECCION",
    devolucionConcurrente: { intentos: 2, exitosas: devoluciones.filter((item) => item.status === "fulfilled").length, cantidadVendida: 1, cantidadDevuelta: Number(cantidadDevuelta) },
    devolucionTurnoCerrado: sinProteccion ? "NO_EJECUTADA" : { devolucionId: String(devolucionEfectivo!.id), salidasTurnoCerrado: movimientosTurnos.original, salidasTurnoActual: movimientosTurnos.actual },
    creditoConcurrente: { intentos: 2, exitosas: creditos.filter((item) => item.status === "fulfilled").length, limite: Number(estadoCredito.cuenta.limiteCredito), ventas: estadoCredito.ventas, totalVendido: Number(estadoCredito.total), saldoGuardado: Number(estadoCredito.cuenta.saldo) },
    apartados: apartadoResultado,
  };
  if (!sinProteccion) {
    assert.equal(resultado.devolucionConcurrente.exitosas, 1);
    assert.equal(resultado.devolucionConcurrente.cantidadDevuelta, 1);
    assert.deepEqual(resultado.devolucionTurnoCerrado, { devolucionId: String(devolucionEfectivo!.id), salidasTurnoCerrado: 0, salidasTurnoActual: 1 });
    assert.equal(resultado.creditoConcurrente.exitosas, 1);
    assert.equal(resultado.creditoConcurrente.totalVendido, 80);
    assert.equal(resultado.creditoConcurrente.saldoGuardado, 80);
    assert.deepEqual(resultado.apartados, { stockReservado: 0, stockLiberado: 1, vencidos: 1, stockTrasVencer: 1 });
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
