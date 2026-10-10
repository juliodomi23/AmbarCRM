import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { Prisma } from "@prisma/client";
import { registrarVentaCaja } from "../../src/lib/caja-db";
import { registrarDevolucion } from "../../src/lib/caja-a2-db";
import { cambiarEstadoVenta } from "../../src/lib/venta-estado-db";
import { ingresosNetosPorPartida, metricasNetasPartida } from "../../src/lib/venta-importes";
import { dbRaw } from "../../src/lib/db";
import { transaccionTenant } from "../../src/lib/retail-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const orgId = BigInt(Date.now()) * 1000n + 996n;
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const actor = { orgId, userId: 0n, rol: "admin", puesto: "Encargado de tienda" };

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Cuadre A4', $2)", [String(orgId), `cuadre-a4-${sufijo}`]);
  return transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.create({ data: { clave: "caja", activo: true, config: {} } });
    const usuario = await tx.usuario.create({ data: { nombre: "Encargada A4", email: `a4-${sufijo}@test.local`, passwordHash: "x", rol: "admin", puesto: "Encargado de tienda" } });
    actor.userId = usuario.id;
    const caja = await tx.caja.create({ data: { nombre: `Caja ${sufijo}` } });
    const turno = await tx.turnoCaja.create({ data: { cajaId: caja.id, usuarioId: usuario.id, fondoInicial: 0 } });
    const producto = await tx.producto.create({ data: { sku: `CUADRE-${sufijo}`, nombre: "Producto cuadre", precio: 100, costo: 40, stock: 20 } });
    await tx.promocion.create({ data: { nombre: "3x2 A4", tipo: "nxm", productoId: producto.id, cantidadCompra: 3, cantidadPaga: 2, inicia: new Date("2020-01-01T12:00:00Z"), termina: new Date("2099-12-31T12:00:00Z") } });
    return { turno, producto };
  });
}

async function vender(turnoId: bigint, productoId: bigint, cantidad: string, descuento: string, pago: string) {
  return registrarVentaCaja(actor, {
    turnoId, contactoId: null, uuidCliente: randomUUID(), descuento: new Prisma.Decimal(descuento), notas: null,
    partidas: [{ productoId, cantidad: new Prisma.Decimal(cantidad), descuento: new Prisma.Decimal(0) }],
    pagos: [{ metodo: "efectivo", monto: new Prisma.Decimal(pago) }],
  });
}

async function main() {
  const base = await preparar();
  const venta = await vender(base.turno.id, base.producto.id, "3", "20", "180");
  const partida = venta.venta.partidas[0];
  assert.equal(partida.costoUnitario?.toFixed(2), "40.00");
  const devolucion = await registrarDevolucion(actor, { ventaId: venta.venta.id, ventaCambioId: null, tipoReembolso: "efectivo", motivo: "Cuadre", partidas: [{ ventaPartidaId: partida.id, cantidad: new Prisma.Decimal(1) }] });
  const cancelada = await vender(base.turno.id, base.producto.id, "1", "0", "100");
  await cambiarEstadoVenta(actor, cancelada.venta.id, "cancelada");

  const guardada = await transaccionTenant(orgId, (tx) => tx.venta.findUniqueOrThrow({
    where: { id: venta.venta.id }, include: { partidas: { include: { devoluciones: true } } },
  }));
  const ingresos = ingresosNetosPorPartida(guardada.partidas, guardada.total);
  const guardadaPartida = guardada.partidas[0];
  const metricas = metricasNetasPartida(ingresos.get(String(guardadaPartida.id))!, guardadaPartida.cantidad, guardadaPartida.costoUnitario, guardadaPartida.devoluciones);
  assert.equal(guardada.total.toFixed(2), "180.00");
  assert.equal(devolucion.total.toFixed(2), "60.00");
  assert.equal(metricas.ingresoNeto.toFixed(2), "120.00");
  assert.equal(metricas.costoNeto?.toFixed(2), "80.00");
  assert.equal(metricas.utilidad?.toFixed(2), "40.00");

  const sinCosto = metricasNetasPartida(new Prisma.Decimal(50), new Prisma.Decimal(1), null, []);
  assert.equal(sinCosto.utilidad, null, "una venta vieja sin costo no debe aparentar utilidad del 100%");
  const canceladaGuardada = await transaccionTenant(orgId, (tx) => tx.venta.findUniqueOrThrow({ where: { id: cancelada.venta.id } }));
  assert.equal(canceladaGuardada.estado, "cancelada");

  console.log(JSON.stringify({
    calculoManual: { cobrado: 180, devolucion: 60, ingresoNeto: 120, costoNeto: 80, utilidad: 40 },
    reporte: { ingresoNeto: metricas.ingresoNeto.toNumber(), costoNeto: metricas.costoNeto?.toNumber(), utilidad: metricas.utilidad?.toNumber() },
    canceladaExcluible: canceladaGuardada.estado === "cancelada",
    ventaViejaSinCosto: { utilidad: sinCosto.utilidad, clasificacion: "sin costo" },
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
