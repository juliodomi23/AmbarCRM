import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { Prisma } from "@prisma/client";
import { crearPedido } from "../../src/lib/pedidos-db";
import { configPedidos } from "../../src/lib/pedidos";
import { dbRaw } from "../../src/lib/db";
import { transaccionTenant } from "../../src/lib/retail-db";
import { registrarVentaCaja } from "../../src/lib/caja-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sinProteccion = process.env.PEDIDOS_SIN_PROTECCION === "1";
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 983n;
const pausa = () => new Promise((resolve) => setTimeout(resolve, 180));
const config = configPedidos({ maxPorTelefono: 10, maxPorIp: 10 });

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Pedidos concurrentes', $2)", [String(orgId), `pedidos-${sufijo}`]);
  return transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.createMany({ data: [{ clave: "pedidos_en_linea", activo: true, config: {} }, { clave: "productos", activo: true, config: {} }, { clave: "ventas", activo: true, config: {} }] });
    const usuario = await tx.usuario.create({ data: { nombre: "Cajero", email: `cajero-${sufijo}@test.local`, passwordHash: "sin-login", puesto: "Cajero" } });
    const caja = await tx.caja.create({ data: { nombre: `Caja ${sufijo}` } });
    const turno = await tx.turnoCaja.create({ data: { cajaId: caja.id, usuarioId: usuario.id, fondoInicial: 0 } });
    const producto = await tx.producto.create({ data: { sku: `PED-${sufijo}`, nombre: "Última pieza", precio: 80, stock: 1, visibleEnLinea: true } });
    const cruce = await tx.producto.create({ data: { sku: `CRUCE-${sufijo}`, nombre: "Pieza pedido contra caja", precio: 50, stock: 1, visibleEnLinea: true } });
    return { usuario, turno, producto, cruce };
  });
}

async function crearSinProteccion(productoId: bigint, indice: number) {
  return transaccionTenant(orgId, async (tx) => {
    const producto = await tx.producto.findUniqueOrThrow({ where: { id: productoId } });
    const ocupada = await tx.reservaPedido.aggregate({ where: { productoId, activa: true }, _sum: { cantidad: true } });
    if (producto.stock.minus(ocupada._sum.cantidad ?? 0).lt(1)) throw new Error("agotado");
    await pausa();
    const contacto = await tx.contacto.create({ data: { nombre: `Cliente ${indice}`, telefono: `55500000${String(indice).padStart(2, "0")}`, fuente: "web" } });
    return tx.venta.create({ data: {
      folio: `SIN-${indice}-${sufijo}`, contactoId: contacto.id, uuidCliente: randomUUID(), tokenSeguimiento: `${indice}`.padStart(32, "0"),
      estado: "pendiente", canal: "tienda_en_linea", subtotal: 80, total: 80, pedidoIp: `127.0.0.${indice}`,
      partidas: { create: { productoId, cantidad: 1, precioUnitario: 80, total: 80 } },
      reservasPedido: { create: { productoId, cantidad: 1 } },
    } });
  });
}

async function cajaSinProteccion(productoId: bigint, usuarioId: bigint, turnoId: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    const producto = await tx.producto.findUniqueOrThrow({ where: { id: productoId } });
    if (producto.stock.lt(1)) throw new Error("agotado");
    await pausa();
    const venta = await tx.venta.create({ data: { folio: `CAJA-SIN-${sufijo}`, turnoId, creadoPorId: usuarioId, estado: "pagada", canal: "mostrador", subtotal: 50, total: 50, stockAplicado: true } });
    await tx.ventaPartida.create({ data: { ventaId: venta.id, productoId, cantidad: 1, precioUnitario: 50, total: 50 } });
    await tx.producto.update({ where: { id: productoId }, data: { stock: producto.stock.minus(1) } });
    return venta;
  });
}

async function main() {
  const base = await preparar();
  const producto = base.producto;
  const pedido = (indice: number) => sinProteccion
    ? crearSinProteccion(producto.id, indice)
    : crearPedido(orgId, config, { uuidCliente: randomUUID(), nombre: `Cliente ${indice}`, telefono10: `55500000${String(indice).padStart(2, "0")}`, ip: `127.0.0.${indice}`, tipoEntrega: "recoger", direccion: null, horarioDeseado: null, notas: null, partidas: [{ productoId: producto.id, cantidad: new Prisma.Decimal(1) }] });
  const intentos = await Promise.allSettled([pedido(1), pedido(2)]);
  const estado = await transaccionTenant(orgId, async (tx) => ({
    pedidos: await tx.venta.count({ where: { canal: "tienda_en_linea" } }),
    reservado: await tx.reservaPedido.aggregate({ where: { productoId: producto.id, activa: true }, _sum: { cantidad: true } }),
    stock: (await tx.producto.findUniqueOrThrow({ where: { id: producto.id } })).stock,
  }));
  const pedidoContraCaja = sinProteccion
    ? crearSinProteccion(base.cruce.id, 21)
    : crearPedido(orgId, config, { uuidCliente: randomUUID(), nombre: "Cliente contra caja", telefono10: "5552223344", ip: "127.0.0.60", tipoEntrega: "recoger", direccion: null, horarioDeseado: null, notas: null, partidas: [{ productoId: base.cruce.id, cantidad: new Prisma.Decimal(1) }] });
  const ventaCaja = sinProteccion
    ? cajaSinProteccion(base.cruce.id, base.usuario.id, base.turno.id)
    : registrarVentaCaja(
        { orgId, userId: base.usuario.id, puesto: "Cajero", rol: "agente" },
        { turnoId: base.turno.id, uuidCliente: randomUUID(), contactoId: null, partidas: [{ productoId: base.cruce.id, cantidad: new Prisma.Decimal(1), descuento: new Prisma.Decimal(0) }], pagos: [{ metodo: "efectivo", monto: new Prisma.Decimal(50) }], descuento: new Prisma.Decimal(0), notas: null },
      );
  const cruceIntentos = await Promise.allSettled([pedidoContraCaja, ventaCaja]);
  const cruceEstado = await transaccionTenant(orgId, async (tx) => ({
    stock: (await tx.producto.findUniqueOrThrow({ where: { id: base.cruce.id } })).stock,
    reservado: (await tx.reservaPedido.aggregate({ where: { productoId: base.cruce.id, activa: true }, _sum: { cantidad: true } }))._sum.cantidad ?? new Prisma.Decimal(0),
    ventasCaja: await tx.ventaPartida.count({ where: { productoId: base.cruce.id, venta: { canal: "mostrador" } } }),
    pedidos: await tx.reservaPedido.count({ where: { productoId: base.cruce.id } }),
  }));
  let idempotencia: { peticiones: number; exitosas: number; ventas: number } | null = null;
  if (!sinProteccion) {
    const segundo = await transaccionTenant(orgId, (tx) => tx.producto.create({ data: { sku: `IDEM-${sufijo}`, nombre: "Pedido idempotente", precio: 20, stock: 5, visibleEnLinea: true } }));
    const uuid = randomUUID();
    const repetidas = await Promise.allSettled(Array.from({ length: 5 }, () => crearPedido(orgId, config, { uuidCliente: uuid, nombre: "Misma clienta", telefono10: "5551112233", ip: "127.0.0.50", tipoEntrega: "recoger", direccion: null, horarioDeseado: null, notas: null, partidas: [{ productoId: segundo.id, cantidad: new Prisma.Decimal(1) }] })));
    const ventas = await transaccionTenant(orgId, (tx) => tx.venta.count({ where: { uuidCliente: uuid } }));
    idempotencia = { peticiones: 5, exitosas: repetidas.filter((r) => r.status === "fulfilled").length, ventas };
  }
  const resultado = {
    modo: sinProteccion ? "SIN_PROTECCION" : "CON_PROTECCION", peticiones: 2,
    exitosas: intentos.filter((i) => i.status === "fulfilled").length, rechazadas: intentos.filter((i) => i.status === "rejected").length,
    pedidosCreados: estado.pedidos, cantidadReservada: Number(estado.reservado._sum.cantidad ?? 0), stockFisico: Number(estado.stock), sobreventa: (estado.reservado._sum.cantidad ?? new Prisma.Decimal(0)).gt(estado.stock),
    pedidoContraCaja: { exitosas: cruceIntentos.filter((i) => i.status === "fulfilled").length, rechazadas: cruceIntentos.filter((i) => i.status === "rejected").length, pedidos: cruceEstado.pedidos, ventasCaja: cruceEstado.ventasCaja, stockFisico: Number(cruceEstado.stock), reservado: Number(cruceEstado.reservado), disponible: Number(cruceEstado.stock.minus(cruceEstado.reservado)) },
    idempotencia,
  };
  if (!sinProteccion) {
    assert.equal(resultado.exitosas, 1); assert.equal(resultado.rechazadas, 1); assert.equal(resultado.pedidosCreados, 1);
    assert.equal(resultado.cantidadReservada, 1); assert.equal(resultado.stockFisico, 1); assert.equal(resultado.sobreventa, false);
    assert.equal(resultado.pedidoContraCaja.exitosas, 1); assert.equal(resultado.pedidoContraCaja.rechazadas, 1);
    assert.equal(resultado.pedidoContraCaja.pedidos + resultado.pedidoContraCaja.ventasCaja, 1);
    assert.equal(resultado.pedidoContraCaja.disponible, 0); assert.ok(resultado.pedidoContraCaja.stockFisico >= 0);
    assert.deepEqual(idempotencia, { peticiones: 5, exitosas: 5, ventas: 1 });
  }
  console.log(JSON.stringify(resultado));
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    const tablas = await admin.query<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id'");
    for (const { table_name } of tablas.rows) await admin.query(`DELETE FROM "${table_name.replaceAll('"', '""')}" WHERE org_id = $1`, [String(orgId)]);
    await admin.query("DELETE FROM orgs WHERE id = $1", [String(orgId)]);
  } finally { await admin.query("SET session_replication_role = origin"); }
}

main().catch((error) => { console.error("FALLO:", error); process.exitCode = 1; }).finally(async () => { await limpiar().catch(console.error); await Promise.all([dbRaw.$disconnect(), admin.end()]); });
