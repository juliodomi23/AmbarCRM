import assert from "node:assert/strict";
import pg from "pg";
import { dbRaw } from "../../src/lib/db";
import {
  registrarColegiaturaIdempotente,
  registrarPagoTourConSaldo,
} from "../../src/lib/cupos-db";
import {
  bloquearCompra,
  bloquearProductos,
  bloquearVenta,
  ErrorRetail,
  transaccionTenant,
} from "../../src/lib/retail-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");

const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const orgId = BigInt(Date.now()) * 1000n + 311n;
const observar = process.env.CONCURRENCIA_OBSERVAR === "1";

const pausa = () => new Promise((resolve) => setTimeout(resolve, 60));

function verificar(comprobacion: () => void) {
  if (!observar) comprobacion();
}

async function crearProducto(nombre: string, stock: number) {
  return transaccionTenant(orgId, (tx) => tx.producto.create({
    data: { sku: `${nombre}-${sufijo}`, nombre, precio: 100, stock },
  }));
}

async function stock(productoId: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    const producto = await tx.producto.findUniqueOrThrow({ where: { id: productoId } });
    return producto.stock;
  });
}

async function vender(productoIds: bigint[], folio: string) {
  return transaccionTenant(orgId, async (tx) => {
    await bloquearProductos(tx, productoIds);
    const productos = await tx.producto.findMany({ where: { id: { in: productoIds } } });
    if (productos.some((producto) => producto.stock < 1)) {
      throw new ErrorRetail("Sin existencias");
    }
    await pausa();
    const venta = await tx.venta.create({
      data: { folio, estado: "pagada", total: productos.length * 100, stockAplicado: true },
    });
    for (const productoId of productoIds) {
      const producto = productos.find((item) => item.id === productoId);
      if (!producto) throw new ErrorRetail("Producto no encontrado");
      const existenciaDespues = producto.stock - 1;
      await tx.producto.update({ where: { id: productoId }, data: { stock: existenciaDespues } });
      await tx.ventaPartida.create({
        data: { ventaId: venta.id, productoId, cantidad: 1, precioUnitario: 100, total: 100 },
      });
      await tx.movimientoInventario.create({
        data: {
          productoId,
          ventaId: venta.id,
          tipo: "venta",
          cantidad: -1,
          existenciaAntes: producto.stock,
          existenciaDespues,
        },
      });
    }
    return venta;
  });
}

async function moverInventario(productoId: bigint, cantidad: number) {
  return transaccionTenant(orgId, async (tx) => {
    await bloquearProductos(tx, [productoId]);
    const producto = await tx.producto.findUniqueOrThrow({ where: { id: productoId } });
    await pausa();
    const existenciaDespues = producto.stock + cantidad;
    await tx.producto.update({ where: { id: productoId }, data: { stock: existenciaDespues } });
    return tx.movimientoInventario.create({
      data: {
        productoId,
        tipo: "entrada",
        cantidad,
        existenciaAntes: producto.stock,
        existenciaDespues,
      },
    });
  });
}

async function recibirCompra(compraId: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    await bloquearCompra(tx, compraId);
    const compra = await tx.compra.findUniqueOrThrow({
      where: { id: compraId },
      include: { partidas: true },
    });
    if (compra.stockAplicado) return compra;
    await bloquearProductos(tx, compra.partidas.map((partida) => partida.productoId));
    await pausa();
    for (const partida of compra.partidas) {
      const producto = await tx.producto.findUniqueOrThrow({ where: { id: partida.productoId } });
      const existenciaDespues = producto.stock + partida.cantidad;
      await tx.producto.update({
        where: { id: producto.id },
        data: { stock: existenciaDespues },
      });
      await tx.movimientoInventario.create({
        data: {
          productoId: producto.id,
          compraId: compra.id,
          tipo: "compra",
          cantidad: partida.cantidad,
          existenciaAntes: producto.stock,
          existenciaDespues,
        },
      });
    }
    return tx.compra.update({
      where: { id: compra.id },
      data: { estado: "recibida", stockAplicado: true },
    });
  });
}

async function cambiarEstadoVenta(ventaId: bigint, estado: string, aplicaStock: boolean) {
  return transaccionTenant(orgId, async (tx) => {
    await bloquearVenta(tx, ventaId);
    const venta = await tx.venta.findUniqueOrThrow({
      where: { id: ventaId },
      include: { partidas: true },
    });
    await pausa();
    if (venta.stockAplicado !== aplicaStock) {
      await bloquearProductos(tx, venta.partidas.map((partida) => partida.productoId));
      for (const partida of venta.partidas) {
        const producto = await tx.producto.findUniqueOrThrow({ where: { id: partida.productoId } });
        const cambio = aplicaStock ? -partida.cantidad : partida.cantidad;
        await tx.producto.update({
          where: { id: producto.id },
          data: { stock: producto.stock + cambio },
        });
      await tx.movimientoInventario.create({
        data: {
          productoId: producto.id,
          ventaId: venta.id,
          tipo: aplicaStock ? "venta" : "devolucion",
          cantidad: cambio,
          existenciaAntes: producto.stock,
          existenciaDespues: producto.stock + cambio,
        },
      });
      }
    }
    return tx.venta.update({
      where: { id: ventaId },
      data: { estado, stockAplicado: aplicaStock },
    });
  });
}

async function escenarioVentas() {
  const producto = await crearProducto("Stock limitado", 3);
  const resultados = await Promise.allSettled(
    Array.from({ length: 10 }, (_, indice) => vender([producto.id], `VENTA-${sufijo}-${indice}`)),
  );
  const aceptadas = resultados.filter((resultado) => resultado.status === "fulfilled").length;
  const stockFinal = await stock(producto.id);
  verificar(() => {
    assert.equal(aceptadas, 3, "deben aceptarse exactamente tres ventas");
    assert.equal(stockFinal, 0, "el stock limitado debe terminar en cero");
  });
  return { aceptadas, stockFinal };
}

async function escenarioOrdenBloqueos() {
  const productoA = await crearProducto("Orden A", 2);
  const productoB = await crearProducto("Orden B", 2);
  const operaciones = Promise.allSettled([
    vender([productoA.id, productoB.id], `ORDEN-AB-${sufijo}`),
    vender([productoB.id, productoA.id], `ORDEN-BA-${sufijo}`),
  ]);
  const resultados = await Promise.race([
    operaciones,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Posible deadlock")), 5000)),
  ]);
  const resueltas = resultados.filter((resultado) => resultado.status === "fulfilled").length;
  const stocks = [await stock(productoA.id), await stock(productoB.id)];
  verificar(() => {
    assert.equal(resueltas, 2);
    assert.deepEqual(stocks, [0, 0]);
  });
  return { resueltas, stocks };
}

async function escenarioMovimientos() {
  const producto = await crearProducto("Movimientos", 0);
  await Promise.all(Array.from({ length: 10 }, () => moverInventario(producto.id, 1)));
  const stockFinal = await stock(producto.id);
  verificar(() => assert.equal(stockFinal, 10, "no debe haber actualizaciones perdidas"));
  return { stockFinal };
}

async function escenarioCompra() {
  const producto = await crearProducto("Compra", 0);
  const compra = await transaccionTenant(orgId, async (tx) => {
    const proveedor = await tx.proveedor.create({ data: { nombre: `Proveedor ${sufijo}` } });
    const creada = await tx.compra.create({
      data: { folio: `COMPRA-${sufijo}`, proveedorId: proveedor.id, total: 500 },
    });
    await tx.compraPartida.create({
      data: { compraId: creada.id, productoId: producto.id, cantidad: 5, costoUnitario: 100, total: 500 },
    });
    return creada;
  });
  await Promise.all([recibirCompra(compra.id), recibirCompra(compra.id)]);
  const stockFinal = await stock(producto.id);
  const movimientos = await transaccionTenant(orgId, (tx) => tx.movimientoInventario.count({
    where: { compraId: compra.id },
  }));
  verificar(() => {
    assert.equal(stockFinal, 5, "una compra simultánea solo debe recibirse una vez");
    assert.equal(movimientos, 1, "la compra debe generar un solo movimiento");
  });
  return { stockFinal, movimientos };
}

async function escenarioCancelarEditar() {
  const producto = await crearProducto("Cancelar venta", 9);
  const venta = await transaccionTenant(orgId, async (tx) => {
    const creada = await tx.venta.create({
      data: { folio: `CANCELAR-${sufijo}`, estado: "pagada", total: 100, stockAplicado: true },
    });
    await tx.ventaPartida.create({
      data: { ventaId: creada.id, productoId: producto.id, cantidad: 1, precioUnitario: 100, total: 100 },
    });
    return creada;
  });
  await Promise.all([
    cambiarEstadoVenta(venta.id, "cancelada", false),
    cambiarEstadoVenta(venta.id, "entregada", true),
  ]);
  const final = await transaccionTenant(orgId, (tx) => tx.venta.findUniqueOrThrow({ where: { id: venta.id } }));
  const stockFinal = await stock(producto.id);
  const movimientos = await transaccionTenant(orgId, (tx) => tx.movimientoInventario.aggregate({
    where: { ventaId: venta.id },
    _sum: { cantidad: true },
    _count: true,
  }));
  verificar(() => {
    assert.equal(stockFinal, final.stockAplicado ? 9 : 10, "el stock debe coincidir con el estado final");
    assert.equal(movimientos._sum.cantidad, final.stockAplicado ? 0 : 1);
  });
  return { estado: final.estado, stockFinal, movimientos: movimientos._count };
}

async function escenarioPagosTour() {
  const base = await transaccionTenant(orgId, async (tx) => {
    const contacto = await tx.contacto.create({ data: { nombre: `Viajero ${sufijo}` } });
    const tour = await tx.tour.create({
      data: { clave: `PAGO-${sufijo}`, nombre: "Tour pagos", destino: "México", capacidad: 20 },
    });
    return tx.reservaTour.create({
      data: {
        codigo: `RESERVA-${sufijo}`,
        tourId: tour.id,
        contactoId: contacto.id,
        total: 1000,
        saldo: 1000,
      },
    });
  });
  const resultados = await Promise.allSettled(
    Array.from({ length: 10 }, (_, indice) => registrarPagoTourConSaldo(orgId, {
      reservaId: base.id,
      concepto: `Pago ${indice}`,
      monto: 300,
    })),
  );
  const aceptados = resultados.filter((resultado) => resultado.status === "fulfilled").length;
  const saldo = await transaccionTenant(orgId, async (tx) => {
    const reserva = await tx.reservaTour.findUniqueOrThrow({ where: { id: base.id } });
    return Number(reserva.saldo);
  });
  verificar(() => {
    assert.equal(aceptados, 3, "solo deben aceptarse tres pagos de 300");
    assert.equal(saldo, 100, "el saldo debe quedar en 100");
  });
  return { aceptados, saldo };
}

async function escenarioColegiatura() {
  const datos = await transaccionTenant(orgId, async (tx) => {
    const contacto = await tx.contacto.create({ data: { nombre: `Alumno ${sufijo}` } });
    const alumno = await tx.alumnoAcademia.create({
      data: { contactoId: contacto.id, matricula: `MAT-${sufijo}` },
    });
    return {
      alumnoId: alumno.id,
      concepto: "Colegiatura octubre",
      periodo: "2026-10",
      monto: 1200,
      vencimiento: new Date("2026-10-15T12:00:00.000Z"),
    };
  });
  const resultados = await Promise.all(
    Array.from({ length: 5 }, () => registrarColegiaturaIdempotente(orgId, datos)),
  );
  const total = await transaccionTenant(orgId, (tx) => tx.colegiaturaAcademia.count({
    where: { alumnoId: datos.alumnoId },
  }));
  verificar(() => {
    assert.equal(total, 1, "el mismo cargo no debe duplicarse");
    assert.equal(new Set(resultados.map((resultado) => String(resultado.id))).size, 1);
  });
  return { solicitudes: 5, cargos: total };
}

async function main() {
  await admin.query(
    "INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Concurrencia retail', $2)",
    [orgId.toString(), `concurrencia-retail-${sufijo}`],
  );
  const resultados = {
    ventas: await escenarioVentas(),
    ordenBloqueos: await escenarioOrdenBloqueos(),
    movimientos: await escenarioMovimientos(),
    compra: await escenarioCompra(),
    cancelarEditar: await escenarioCancelarEditar(),
    pagosTour: await escenarioPagosTour(),
    colegiatura: await escenarioColegiatura(),
  };
  console.log(
    observar ? "OBSERVACIÓN · concurrencia retail" : "OK · concurrencia retail",
    JSON.stringify(resultados),
  );
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    const tablas = await admin.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'org_id'`,
    );
    for (const { table_name: tabla } of tablas.rows) {
      await admin.query(`DELETE FROM "${tabla.replaceAll('"', '""')}" WHERE org_id = $1`, [
        orgId.toString(),
      ]);
    }
    await admin.query("DELETE FROM orgs WHERE id = $1", [orgId.toString()]);
  } finally {
    await admin.query("SET session_replication_role = origin");
  }
}

main()
  .catch((error) => {
    console.error("FALLO:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await limpiar().catch((error) => console.error("No se pudo limpiar:", error));
    await Promise.all([dbRaw.$disconnect(), admin.end()]);
  });
