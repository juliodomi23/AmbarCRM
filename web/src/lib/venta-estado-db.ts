import { Prisma } from "@prisma/client";
import { puedeCancelarVentaCaja } from "@/lib/caja";
import { bloquearTurnoCaja } from "@/lib/caja-db";
import { estadoUsaInventario, type EstadoVenta } from "@/lib/retail";
import {
  bloquearProductos,
  bloquearVenta,
  ErrorRetail,
  reservasActivasPorProducto,
  transaccionTenant,
} from "@/lib/retail-db";

type IdentidadVenta = {
  orgId: bigint;
  userId: bigint | null;
  rol?: string;
  puesto?: string;
};

async function obtenerTurnoId(tx: Prisma.TransactionClient, ventaId: bigint) {
  const filas = await tx.$queryRaw<Array<{ turno_id: bigint | null }>>(Prisma.sql`
    SELECT turno_id
    FROM ventas
    WHERE id = ${ventaId}
  `);
  if (!filas[0]) throw new ErrorRetail("Venta no encontrada", 404);
  return filas[0].turno_id;
}

export async function cambiarEstadoVenta(
  sesion: IdentidadVenta,
  ventaId: bigint,
  estado: EstadoVenta,
) {
  return transaccionTenant(sesion.orgId, async (tx) => {
    const turnoId = await obtenerTurnoId(tx, ventaId);
    if (turnoId !== null) await bloquearTurnoCaja(tx, turnoId);

    await bloquearVenta(tx, ventaId);
    const actual = await tx.venta.findUnique({
      where: { id: ventaId },
      include: { pagos: true, partidas: { include: { producto: true } }, reservasPedido: true },
    });
    if (!actual) throw new ErrorRetail("Venta no encontrada", 404);

    if (estado === "cancelada" && actual.estado !== "cancelada") {
      const devoluciones = await tx.devolucionVenta.count({ where: { ventaOriginalId: actual.id } });
      if (devoluciones > 0) {
        throw new ErrorRetail("La venta ya tiene devoluciones; registra una devolución por lo que falta", 409);
      }
    }

    if (actual.turnoId !== null && estado === "cancelada") {
      if (!puedeCancelarVentaCaja(sesion.rol, sesion.puesto)) {
        throw new ErrorRetail("Cancelar una venta de caja requiere Encargado de tienda o Admin", 403);
      }
      const turno = await tx.turnoCaja.findUnique({ where: { id: actual.turnoId } });
      if (!turno || turno.estado !== "abierto") {
        throw new ErrorRetail("Este turno ya tuvo corte; registra una devolución", 409);
      }
      if (actual.estado !== "cancelada") {
        const efectivoPagado = actual.pagos.find((pago) => pago.metodo === "efectivo")?.monto ?? new Prisma.Decimal(0);
        const efectivoDevuelto = efectivoPagado.minus(actual.cambio);
        if (efectivoDevuelto.gt(0)) {
          await tx.movimientoCaja.create({
            data: {
              turnoId: turno.id,
              tipo: "salida",
              monto: efectivoDevuelto,
              motivo: `Cancelación de ${actual.folio}`,
              usuarioId: sesion.userId,
            },
          });
        }
      }
    }

    const debeAplicar = estadoUsaInventario(estado);
    if (debeAplicar !== actual.stockAplicado) {
      await bloquearProductos(
        tx,
        actual.partidas.map((partida) => partida.productoId),
      );
      const reservadas = debeAplicar
        ? await reservasActivasPorProducto(tx, actual.partidas.map((partida) => partida.productoId), actual.id)
        : new Map<string, Prisma.Decimal>();
      for (const partida of actual.partidas) {
        const producto = await tx.producto.findUnique({ where: { id: partida.productoId } });
        if (!producto) throw new ErrorRetail("Uno de los productos ya no existe");
        const cambio = debeAplicar ? partida.cantidad.neg() : partida.cantidad;
        const existenciaDespues = producto.stock.plus(cambio);
        if (existenciaDespues.minus(reservadas.get(String(producto.id)) ?? 0).lt(0)) {
          throw new ErrorRetail(`No hay existencias suficientes de ${producto.nombre}`);
        }
        await tx.producto.update({
          where: { id: producto.id },
          data: { stock: existenciaDespues },
        });
        await tx.movimientoInventario.create({
          data: {
            productoId: producto.id,
            ventaId: actual.id,
            usuarioId: sesion.userId,
            tipo: debeAplicar ? "venta" : "devolucion",
            cantidad: cambio,
            existenciaAntes: producto.stock,
            existenciaDespues,
            motivo: debeAplicar
              ? `Inventario aplicado a ${actual.folio}`
              : `Inventario devuelto por ${actual.folio}`,
          },
        });
      }
    }
    if (actual.canal === "tienda_en_linea" && actual.reservasPedido.some((reserva) => reserva.activa)) {
      await tx.reservaPedido.updateMany({ where: { ventaId: actual.id, activa: true }, data: { activa: false } });
    }
    return tx.venta.update({
      where: { id: ventaId },
      data: { estado, stockAplicado: debeAplicar },
      include: { contacto: true, partidas: { include: { producto: true } } },
    });
  });
}
