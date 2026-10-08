import { NextRequest, NextResponse } from "next/server";
import { aBigInt } from "@/lib/ids";
import { requireModuloActivo } from "@/lib/modulos";
import {
  ESTADOS_VENTA,
  estadoUsaInventario,
  type EstadoVenta,
} from "@/lib/retail";
import { ErrorRetail, transaccionTenant } from "@/lib/retail-db";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("ventas");
  if (apagado) return apagado;
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
      const actual = await tx.venta.findUnique({
        where: { id },
        include: { partidas: { include: { producto: true } } },
      });
      if (!actual) throw new ErrorRetail("Venta no encontrada", 404);
      const debeAplicar = estadoUsaInventario(estado);
      if (debeAplicar !== actual.stockAplicado) {
        for (const partida of actual.partidas) {
          const producto = await tx.producto.findUnique({ where: { id: partida.productoId } });
          if (!producto) throw new ErrorRetail("Uno de los productos ya no existe");
          const cambio = debeAplicar ? -partida.cantidad : partida.cantidad;
          const existenciaDespues = producto.stock + cambio;
          if (existenciaDespues < 0) {
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
}
