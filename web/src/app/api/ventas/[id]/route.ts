import { NextRequest, NextResponse } from "next/server";
import { aBigInt } from "@/lib/ids";
import {
  ESTADOS_VENTA,
  estadoUsaInventario,
  type EstadoVenta,
} from "@/lib/retail";
import {
  bloquearProductos,
  bloquearVenta,
  ErrorRetail,
  transaccionTenant,
} from "@/lib/retail-db";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";
import { puedeCancelarVentaCaja } from "@/lib/caja";

export const PATCH = conModulo(
  "ventas",
  {},
  async (sesion, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const id = aBigInt((await params).id);
  if (id === null || sesion.orgId === null) {
    return NextResponse.json({ error: "Venta u organización inválidas" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const estado = String(body.estado ?? "") as EstadoVenta;
  if (!ESTADOS_VENTA.includes(estado)) {
    return NextResponse.json({ error: "El estado no es válido" }, { status: 400 });
  }

  try {
    const venta = await transaccionTenant(sesion.orgId, async (tx) => {
      await bloquearVenta(tx, id);
      const actual = await tx.venta.findUnique({
        where: { id },
        include: { partidas: { include: { producto: true } } },
      });
      if (!actual) throw new ErrorRetail("Venta no encontrada", 404);
      if (
        actual.turnoId !== null &&
        estado === "cancelada" &&
        !puedeCancelarVentaCaja(sesion.rol, sesion.puesto)
      ) {
        throw new ErrorRetail("Cancelar una venta de caja requiere Encargado de tienda o Admin", 403);
      }
      const debeAplicar = estadoUsaInventario(estado);
      if (debeAplicar !== actual.stockAplicado) {
        await bloquearProductos(
          tx,
          actual.partidas.map((partida) => partida.productoId),
        );
        for (const partida of actual.partidas) {
          const producto = await tx.producto.findUnique({ where: { id: partida.productoId } });
          if (!producto) throw new ErrorRetail("Uno de los productos ya no existe");
          const cambio = debeAplicar ? partida.cantidad.neg() : partida.cantidad;
          const existenciaDespues = producto.stock.plus(cambio);
          if (existenciaDespues.lt(0)) {
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
      return tx.venta.update({
        where: { id },
        data: { estado, stockAplicado: debeAplicar },
        include: { contacto: true, partidas: { include: { producto: true } } },
      });
    });
    return NextResponse.json(serializar({ venta }));
  } catch (error) {
    if (error instanceof ErrorRetail) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  },
);
