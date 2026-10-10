import assert from "node:assert/strict";
import pg from "pg";
import { Prisma } from "@prisma/client";
import { dbRaw } from "../../src/lib/db";
import { vencerPedidos } from "../../src/lib/pedidos-vencimiento-db";
import { transaccionTenant } from "../../src/lib/retail-db";
import { cambiarEstadoVenta } from "../../src/lib/venta-estado-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sinProteccion = process.env.PEDIDOS_VENCIMIENTO_SIN_PROTECCION === "1";
const orgId = BigInt(Date.now()) * 1000n + 991n;
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const antiguo = new Date(Date.now() - 2 * 60 * 60_000);

async function pedido(productoId: bigint, folio: string) {
  return transaccionTenant(orgId, (tx) => tx.venta.create({
    data: {
      folio,
      canal: "tienda_en_linea",
      estado: "pendiente",
      subtotal: 100,
      total: 100,
      stockAplicado: false,
      createdAt: antiguo,
      partidas: { create: { productoId, cantidad: 1, precioUnitario: 100, total: 100 } },
      reservasPedido: { create: { productoId, cantidad: 1 } },
    },
  }));
}

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Vencimiento pedidos', $2)", [String(orgId), `vence-pedidos-${sufijo}`]);
  return transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.create({ data: { clave: "pedidos_en_linea", activo: true, config: { horasVencimiento: 1 } } });
    const productos = await Promise.all(["vence", "cruce", "confirmado", "estado"].map((nombre) => tx.producto.create({
      data: { sku: `${nombre}-${sufijo}`, nombre, precio: 100, stock: 1, visibleEnLinea: true },
    })));
    return productos;
  });
}

async function vencerSinProteccion(ventaId: bigint, leido: () => void, continuar: Promise<void>) {
  return transaccionTenant(orgId, async (tx) => {
    const venta = await tx.venta.findUniqueOrThrow({ where: { id: ventaId } });
    if (venta.estado !== "pendiente" || venta.stockAplicado) return 0;
    leido();
    await continuar;
    await tx.reservaPedido.updateMany({ where: { ventaId, activa: true }, data: { activa: false } });
    await tx.venta.update({ where: { id: ventaId }, data: { estado: "cancelada" } });
    return 1;
  });
}

async function main() {
  const [productoVence, productoCruce, productoConfirmado, productoEstado] = await preparar();

  const vencido = await pedido(productoVence.id, `VENCE-${sufijo}`);
  const cantidadVencida = await vencerPedidos(orgId);
  const estadoVencido = await transaccionTenant(orgId, async (tx) => ({
    venta: await tx.venta.findUniqueOrThrow({ where: { id: vencido.id } }),
    reserva: await tx.reservaPedido.findFirstOrThrow({ where: { ventaId: vencido.id } }),
  }));
  assert.equal(cantidadVencida, 1);
  assert.equal(estadoVencido.venta.estado, "cancelada");
  assert.equal(estadoVencido.reserva.activa, false);

  const yaConfirmado = await pedido(productoConfirmado.id, `CONFIRMADO-${sufijo}`);
  await cambiarEstadoVenta({ orgId, userId: null }, yaConfirmado.id, "preparando");
  assert.equal(await vencerPedidos(orgId), 0, "un pedido confirmado no se vence");

  const estadoPedido = await pedido(productoEstado.id, `ESTADO-${sufijo}`);
  await assert.rejects(
    cambiarEstadoVenta({ orgId, userId: null }, estadoPedido.id, "borrador"),
    (error: unknown) => error instanceof Error && "status" in error && error.status === 409,
  );

  const cruce = await pedido(productoCruce.id, `CRUCE-${sufijo}`);
  let liberar!: () => void;
  const continuar = new Promise<void>((resolve) => { liberar = resolve; });
  let avisoLectura!: () => void;
  const lectura = new Promise<void>((resolve) => { avisoLectura = resolve; });

  let intentos: PromiseSettledResult<unknown>[];
  if (sinProteccion) {
    const vencer = vencerSinProteccion(cruce.id, avisoLectura, continuar);
    await lectura;
    const confirmar = cambiarEstadoVenta({ orgId, userId: null }, cruce.id, "preparando");
    await confirmar;
    liberar();
    intentos = await Promise.allSettled([vencer, Promise.resolve(confirmar)]);
  } else {
    intentos = await Promise.allSettled([
      vencerPedidos(orgId),
      cambiarEstadoVenta({ orgId, userId: null }, cruce.id, "preparando"),
    ]);
  }

  const final = await transaccionTenant(orgId, async (tx) => ({
    venta: await tx.venta.findUniqueOrThrow({ where: { id: cruce.id } }),
    reserva: await tx.reservaPedido.findFirstOrThrow({ where: { ventaId: cruce.id } }),
    producto: await tx.producto.findUniqueOrThrow({ where: { id: productoCruce.id } }),
  }));
  const accionesGanadoras = (final.venta.estado === "cancelada" ? 1 : 0) + (final.venta.stockAplicado ? 1 : 0);
  const resultado = {
    modo: sinProteccion ? "SIN_PROTECCION" : "CON_PROTECCION",
    vencimientoSimple: { estado: estadoVencido.venta.estado, reservaActiva: estadoVencido.reserva.activa },
    cruce: {
      operacionesCumplidas: intentos.filter((intento) => intento.status === "fulfilled").length,
      accionesGanadoras,
      estado: final.venta.estado,
      stockAplicado: final.venta.stockAplicado,
      stock: Number(final.producto.stock),
      reservaActiva: final.reserva.activa,
      consistente: accionesGanadoras === 1 && Number(final.producto.stock) >= 0 && !final.reserva.activa,
    },
    pendienteABorrador: "409",
  };
  if (!sinProteccion) {
    assert.equal(resultado.cruce.accionesGanadoras, 1);
    assert.equal(resultado.cruce.consistente, true);
    assert.ok(resultado.cruce.stock >= 0);
    assert.equal(resultado.cruce.reservaActiva, false);
  } else {
    assert.equal(resultado.cruce.accionesGanadoras, 2, "sin lock vencimiento y confirmación escriben ambos");
    assert.equal(resultado.cruce.consistente, false);
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

main().catch((error) => { console.error("FALLO:", error); process.exitCode = 1; }).finally(async () => {
  await limpiar().catch(console.error);
  await Promise.all([dbRaw.$disconnect(), admin.end()]);
});
