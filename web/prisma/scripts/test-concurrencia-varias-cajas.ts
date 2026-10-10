import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { Prisma } from "@prisma/client";
import { registrarVentaCaja } from "../../src/lib/caja-db";
import { bloquearProductos, transaccionTenant } from "../../src/lib/retail-db";
import { dbRaw } from "../../src/lib/db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const orgId = BigInt(Date.now()) * 1000n + 997n;
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const pausa = () => new Promise((resolve) => setTimeout(resolve, 150));

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Varias cajas A4', $2)", [String(orgId), `varias-cajas-${sufijo}`]);
  return transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.create({ data: { clave: "caja", activo: true, config: {} } });
    const usuarios = await Promise.all([1, 2].map((numero) => tx.usuario.create({ data: { nombre: `Cajero ${numero}`, email: `caja-${numero}-${sufijo}@test.local`, passwordHash: "x", rol: "agente", puesto: "Cajero" } })));
    const cajas = await Promise.all([1, 2].map((numero) => tx.caja.create({ data: { nombre: `Caja ${numero} ${sufijo}` } })));
    const turnos = await Promise.all(cajas.map((caja, indice) => tx.turnoCaja.create({ data: { cajaId: caja.id, usuarioId: usuarios[indice].id, fondoInicial: 0 } })));
    const sinProteccion = await tx.producto.create({ data: { sku: `SIN-${sufijo}`, nombre: "Última pieza sin protección", precio: 100, stock: 0 } });
    const protegido = await tx.producto.create({ data: { sku: `CON-${sufijo}`, nombre: "Última pieza protegida", precio: 100, stock: 0 } });
    await bloquearProductos(tx, [sinProteccion.id, protegido.id]);
    await tx.producto.updateMany({ where: { id: { in: [sinProteccion.id, protegido.id] } }, data: { stock: 1 } });
    return { usuarios, turnos, sinProteccion, protegido };
  });
}

async function venderSinProteccion(usuarioId: bigint, turnoId: bigint, productoId: bigint, indice: number) {
  return transaccionTenant(orgId, async (tx) => {
    const producto = await tx.producto.findUniqueOrThrow({ where: { id: productoId } });
    if (producto.stock.lt(1)) throw new Error("agotado");
    await pausa();
    const venta = await tx.venta.create({ data: { folio: `SIN-${indice}-${sufijo}`, turnoId, creadoPorId: usuarioId, estado: "pagada", canal: "mostrador", subtotal: 100, total: 100, stockAplicado: true } });
    await tx.ventaPartida.create({ data: { ventaId: venta.id, productoId, cantidad: 1, precioUnitario: 100, costoUnitario: producto.costo, total: 100 } });
    await tx.producto.update({ where: { id: productoId }, data: { stock: producto.stock.minus(1) } });
    return venta;
  });
}

async function main() {
  const base = await preparar();
  const sin = await Promise.allSettled(base.usuarios.map((usuario, indice) => venderSinProteccion(usuario.id, base.turnos[indice].id, base.sinProteccion.id, indice)));
  const con = await Promise.allSettled(base.usuarios.map((usuario, indice) => registrarVentaCaja(
    { orgId, userId: usuario.id, rol: "agente", puesto: "Cajero" },
    { turnoId: base.turnos[indice].id, contactoId: null, uuidCliente: randomUUID(), descuento: new Prisma.Decimal(0), notas: null, partidas: [{ productoId: base.protegido.id, cantidad: new Prisma.Decimal(1), descuento: new Prisma.Decimal(0) }], pagos: [{ metodo: "efectivo", monto: new Prisma.Decimal(100) }] },
  )));
  const estado = await transaccionTenant(orgId, async (tx) => ({
    sinVentas: await tx.venta.count({ where: { partidas: { some: { productoId: base.sinProteccion.id } } } }),
    sinStock: (await tx.producto.findUniqueOrThrow({ where: { id: base.sinProteccion.id } })).stock,
    conVentas: await tx.venta.count({ where: { partidas: { some: { productoId: base.protegido.id } } } }),
    conStock: (await tx.producto.findUniqueOrThrow({ where: { id: base.protegido.id } })).stock,
  }));
  assert.equal(sin.filter((resultado) => resultado.status === "fulfilled").length, 2);
  assert.equal(estado.sinVentas, 2);
  assert.equal(con.filter((resultado) => resultado.status === "fulfilled").length, 1);
  assert.equal(estado.conVentas, 1);
  assert.equal(estado.conStock.toFixed(3), "0.000");
  console.log(JSON.stringify({
    sinProteccion: { intentos: 2, ventas: estado.sinVentas, existenciaFinal: estado.sinStock.toFixed(3) },
    conProteccion: { intentos: 2, ventas: estado.conVentas, rechazadas: 1, existenciaFinal: estado.conStock.toFixed(3) },
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
