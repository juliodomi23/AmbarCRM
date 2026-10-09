import assert from "node:assert/strict";
import pg from "pg";
import { Prisma } from "@prisma/client";
import { cancelarApartado, crearApartado, registrarDevolucion, vencerApartados } from "../../src/lib/caja-a2-db";
import { abrirTurnoCaja, cerrarTurnoCaja, corteX, registrarVentaCaja } from "../../src/lib/caja-db";
import { dbRaw } from "../../src/lib/db";
import { bloquearProductos, transaccionTenant } from "../../src/lib/retail-db";
import { cambiarEstadoVenta } from "../../src/lib/venta-estado-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 947n;

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Dinero caja', $2)", [orgId.toString(), `dinero-caja-${sufijo}`]);
  return transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.create({ data: { clave: "caja", activo: true, config: { apartadoDiasVigencia: 7 } } });
    const usuario = await tx.usuario.create({ data: { nombre: "Encargado dinero", email: `dinero-${sufijo}@test.local`, passwordHash: "no-login", puesto: "Encargado de tienda" } });
    const caja = await tx.caja.create({ data: { nombre: `Caja dinero ${sufijo}` } });
    const contacto = await tx.contacto.create({ data: { nombre: "Cliente dinero", telefono: `961${String(Date.now()).slice(-7)}` } });
    const productos = await Promise.all(Array.from({ length: 7 }, (_, indice) => tx.producto.create({
      data: { sku: `DIN-${indice}-${sufijo}`, nombre: `Producto dinero ${indice}`, precio: indice < 2 ? 200 : 100, stock: 0 },
    })));
    await bloquearProductos(tx, productos.map((producto) => producto.id));
    for (const producto of productos) await tx.producto.update({ where: { id: producto.id }, data: { stock: 1 } });
    return { usuario, caja, contacto, productos };
  });
}

async function main() {
  const base = await preparar();
  const actor = { userId: base.usuario.id, orgId, rol: "agente" as const, puesto: "Encargado de tienda" };
  const fondo = new Prisma.Decimal(500);
  const abrir = () => abrirTurnoCaja(actor, { cajaId: base.caja.id, fondoInicial: fondo });

  const turnoA = await abrir();
  const apartadoA = await crearApartado(actor, {
    turnoId: turnoA.id, contactoId: base.contacto.id, uuidCliente: `apartado-reembolso-${sufijo}`,
    anticipo: new Prisma.Decimal(100), metodo: "efectivo", notas: null,
    partidas: [{ productoId: base.productos[0].id, cantidad: new Prisma.Decimal(1), descuento: new Prisma.Decimal(0) }],
  });
  await cancelarApartado(actor, apartadoA.apartado.id, "efectivo");
  const corteA = await corteX(actor, turnoA.id);
  assert.equal(corteA.efectivoEsperado.toString(), "500");
  await cerrarTurnoCaja(actor, turnoA.id, fondo);

  const turnoB = await abrir();
  const apartadoB = await crearApartado(actor, {
    turnoId: turnoB.id, contactoId: base.contacto.id, uuidCliente: `apartado-vence-${sufijo}`,
    anticipo: new Prisma.Decimal(100), metodo: "efectivo", notas: null,
    partidas: [{ productoId: base.productos[1].id, cantidad: new Prisma.Decimal(1), descuento: new Prisma.Decimal(0) }],
  });
  await transaccionTenant(orgId, (tx) => tx.apartado.update({ where: { id: apartadoB.apartado.id }, data: { venceAt: new Date(Date.now() - 60_000) } }));
  assert.equal(await vencerApartados({ orgId, userId: null }), 1);
  const corteB = await corteX(actor, turnoB.id);
  assert.equal(corteB.efectivoEsperado.toString(), "600");
  await cerrarTurnoCaja(actor, turnoB.id, new Prisma.Decimal(600));

  const turnoC = await abrir();
  const ventaC = await registrarVentaCaja(actor, {
    turnoId: turnoC.id, contactoId: null, uuidCliente: `venta-cancelada-${sufijo}`, descuento: new Prisma.Decimal(0), notas: null,
    partidas: [{ productoId: base.productos[2].id, cantidad: new Prisma.Decimal(1), descuento: new Prisma.Decimal(0) }],
    pagos: [{ metodo: "efectivo", monto: new Prisma.Decimal(100) }],
  });
  await cambiarEstadoVenta(actor, ventaC.venta.id, "cancelada");
  const corteC = await corteX(actor, turnoC.id);
  assert.equal(corteC.efectivoEsperado.toString(), "500");
  await cerrarTurnoCaja(actor, turnoC.id, fondo);

  const turnoD = await abrir();
  const ventaD = await registrarVentaCaja(actor, {
    turnoId: turnoD.id, contactoId: null, uuidCliente: `venta-mixta-${sufijo}`, descuento: new Prisma.Decimal(0), notas: null,
    partidas: [{ productoId: base.productos[3].id, cantidad: new Prisma.Decimal(1), descuento: new Prisma.Decimal(0) }],
    pagos: [{ metodo: "efectivo", monto: new Prisma.Decimal(60) }, { metodo: "tarjeta", monto: new Prisma.Decimal(40) }],
  });
  await cambiarEstadoVenta(actor, ventaD.venta.id, "cancelada");
  const corteD = await corteX(actor, turnoD.id);
  const salidaD = await transaccionTenant(orgId, (tx) => tx.movimientoCaja.findFirstOrThrow({ where: { turnoId: turnoD.id, tipo: "salida" } }));
  assert.equal(salidaD.monto.toString(), "60");
  assert.equal(corteD.efectivoEsperado.toString(), "500");
  await cerrarTurnoCaja(actor, turnoD.id, fondo);

  const turnoE = await abrir();
  const ventaE = await registrarVentaCaja(actor, {
    turnoId: turnoE.id, contactoId: base.contacto.id, uuidCliente: `venta-prorrateo-${sufijo}`, descuento: new Prisma.Decimal(20), notas: null,
    partidas: [4, 5].map((indice) => ({ productoId: base.productos[indice].id, cantidad: new Prisma.Decimal(1), descuento: new Prisma.Decimal(0) })),
    pagos: [{ metodo: "efectivo", monto: new Prisma.Decimal(180) }],
  });
  const primera = await registrarDevolucion(actor, {
    ventaId: ventaE.venta.id, ventaCambioId: null, tipoReembolso: "nota_credito", motivo: null,
    partidas: [{ ventaPartidaId: ventaE.venta.partidas[0].id, cantidad: new Prisma.Decimal(1) }],
  });
  const segunda = await registrarDevolucion(actor, {
    ventaId: ventaE.venta.id, ventaCambioId: null, tipoReembolso: "nota_credito", motivo: null,
    partidas: [{ ventaPartidaId: ventaE.venta.partidas[1].id, cantidad: new Prisma.Decimal(1) }],
  });
  assert.equal(primera.total.toString(), "90");
  assert.equal(segunda.total.toString(), "90");
  const totalDevuelto = await transaccionTenant(orgId, async (tx) => (
    await tx.devolucionVenta.aggregate({ where: { ventaOriginalId: ventaE.venta.id }, _sum: { total: true } })
  )._sum.total ?? new Prisma.Decimal(0));
  assert.equal(totalDevuelto.toString(), "180");
  await cerrarTurnoCaja(actor, turnoE.id, new Prisma.Decimal(680));

  const turnoCerradoA = await transaccionTenant(orgId, (tx) => tx.turnoCaja.findUniqueOrThrow({ where: { id: turnoA.id } }));
  assert.equal(turnoCerradoA.efectivoEsperado?.toString(), "500");
  const movimientoCron = await transaccionTenant(orgId, (tx) => tx.movimientoInventario.findFirstOrThrow({
    where: { ventaId: apartadoB.apartado.ventaId, motivo: { startsWith: "Vencimiento" } },
  }));
  assert.equal(movimientoCron.usuarioId, null);

  console.log(JSON.stringify({
    apartadoReembolsado: { fondo: 500, esperado: Number(corteA.efectivoEsperado) },
    apartadoVencido: { fondo: 500, anticipo: 100, esperado: Number(corteB.efectivoEsperado), usuarioMovimiento: movimientoCron.usuarioId },
    ventaCancelada: { fondo: 500, efectivo: 100, esperado: Number(corteC.efectivoEsperado) },
    ventaMixtaCancelada: { fondo: 500, efectivo: 60, tarjeta: 40, salida: Number(salidaD.monto), esperado: Number(corteD.efectivoEsperado) },
    turnoCerrado: { esperadoGuardado: Number(turnoCerradoA.efectivoEsperado) },
    devolucionConDescuento: { primera: Number(primera.total), segunda: Number(segunda.total), totalDevuelto: Number(totalDevuelto), totalVenta: Number(ventaE.venta.total) },
  }));
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
