import assert from "node:assert/strict";
import pg from "pg";
import { Prisma } from "@prisma/client";
import { abrirTurnoCaja, registrarVentaCaja } from "../../src/lib/caja-db";
import { dbRaw } from "../../src/lib/db";
import { bloquearProductos, transaccionTenant } from "../../src/lib/retail-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sinProteccion = process.env.NOTA_CREDITO_SIN_PROTECCION === "1";
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 953n;
const pausa = () => new Promise((resolve) => setTimeout(resolve, 150));

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Concurrencia nota', $2)", [orgId.toString(), `nota-${sufijo}`]);
  return transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.create({ data: { clave: "caja", activo: true, config: {} } });
    const contacto = await tx.contacto.create({ data: { nombre: "Cliente nota", telefono: `960${String(Date.now()).slice(-7)}` } });
    const usuarios = await Promise.all([0, 1].map((indice) => tx.usuario.create({ data: { nombre: `Cajero nota ${indice}`, email: `nota-${indice}-${sufijo}@test.local`, passwordHash: "no-login", puesto: "Cajero" } })));
    const cajas = await Promise.all([0, 1].map((indice) => tx.caja.create({ data: { nombre: `Caja nota ${indice}-${sufijo}` } })));
    const productos = await Promise.all([0, 1].map((indice) => tx.producto.create({ data: { sku: `NOTA-${indice}-${sufijo}`, nombre: `Producto nota ${indice}`, precio: 80, stock: 0 } })));
    await bloquearProductos(tx, productos.map((producto) => producto.id));
    for (const producto of productos) await tx.producto.update({ where: { id: producto.id }, data: { stock: 1 } });
    const ventaOrigen = await tx.venta.create({ data: { folio: `ORIGEN-${sufijo}`, contactoId: contacto.id, estado: "cancelada", subtotal: 100, total: 100 } });
    const apartado = await tx.apartado.create({ data: { ventaId: ventaOrigen.id, contactoId: contacto.id, estado: "cancelado", anticipo: 100, saldo: 0, venceAt: new Date(), canceladoAt: new Date() } });
    const nota = await tx.notaCreditoCliente.create({ data: { contactoId: contacto.id, apartadoId: apartado.id, montoOriginal: 100, saldo: 100 } });
    return { contacto, usuarios, cajas, productos, nota };
  });
}

async function venderSinProteccion(turnoId: bigint, usuarioId: bigint, productoId: bigint, contactoId: bigint, notaId: bigint, uuid: string) {
  return transaccionTenant(orgId, async (tx) => {
    const [turno, producto, nota] = await Promise.all([
      tx.turnoCaja.findUniqueOrThrow({ where: { id: turnoId } }),
      tx.producto.findUniqueOrThrow({ where: { id: productoId } }),
      tx.notaCreditoCliente.findUniqueOrThrow({ where: { id: notaId } }),
    ]);
    if (nota.saldo.lt(80)) throw new Error("saldo insuficiente");
    await pausa();
    const venta = await tx.venta.create({ data: { folio: `NP-${uuid}`, turnoId, cajaId: turno.cajaId, contactoId, creadoPorId: usuarioId, uuidCliente: uuid, estado: "pagada", subtotal: 80, total: 80, stockAplicado: true, metodoPago: "nota_credito" } });
    await tx.ventaPartida.create({ data: { ventaId: venta.id, productoId, cantidad: 1, precioUnitario: 80, total: 80 } });
    await tx.pagoVenta.create({ data: { ventaId: venta.id, metodo: "nota_credito", monto: 80 } });
    await tx.notaCreditoCliente.update({ where: { id: nota.id }, data: { saldo: nota.saldo.minus(80) } });
    await tx.producto.update({ where: { id: producto.id }, data: { stock: producto.stock.minus(1) } });
    return venta;
  });
}

async function main() {
  const base = await preparar();
  const actores = base.usuarios.map((usuario) => ({ userId: usuario.id, orgId, rol: "agente" as const, puesto: "Cajero" }));
  const turnos = await Promise.all(actores.map((actor, indice) => abrirTurnoCaja(actor, { cajaId: base.cajas[indice].id, fondoInicial: new Prisma.Decimal(0) })));
  const vender = sinProteccion
    ? (indice: number) => venderSinProteccion(turnos[indice].id, actores[indice].userId, base.productos[indice].id, base.contacto.id, base.nota.id, `sin-${indice}-${sufijo}`)
    : (indice: number) => registrarVentaCaja(actores[indice], {
      turnoId: turnos[indice].id, contactoId: base.contacto.id, uuidCliente: `con-${indice}-${sufijo}`, descuento: new Prisma.Decimal(0), notas: null,
      partidas: [{ productoId: base.productos[indice].id, cantidad: new Prisma.Decimal(1), descuento: new Prisma.Decimal(0) }],
      pagos: [{ metodo: "nota_credito", monto: new Prisma.Decimal(80) }],
    });
  const intentos = await Promise.allSettled([vender(0), vender(1)]);
  const estado = await transaccionTenant(orgId, async (tx) => ({
    saldo: (await tx.notaCreditoCliente.findUniqueOrThrow({ where: { id: base.nota.id } })).saldo,
    ventas: await tx.venta.count({ where: { pagos: { some: { metodo: "nota_credito" } } } }),
  }));
  const resultado = {
    modo: sinProteccion ? "SIN_PROTECCION" : "CON_PROTECCION",
    intentos: 2,
    exitosas: intentos.filter((intento) => intento.status === "fulfilled").length,
    ventas: estado.ventas,
    saldoInicial: 100,
    importePorVenta: 80,
    saldoFinal: Number(estado.saldo),
    saldoNegativo: estado.saldo.lt(0),
  };
  if (!sinProteccion) {
    assert.equal(resultado.exitosas, 1);
    assert.equal(resultado.ventas, 1);
    assert.equal(resultado.saldoFinal, 20);
    assert.equal(resultado.saldoNegativo, false);
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
