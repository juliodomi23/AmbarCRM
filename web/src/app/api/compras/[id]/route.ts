import { NextRequest, NextResponse } from "next/server";
import { aBigInt } from "@/lib/ids";
import {
  compraUsaInventario,
  ESTADOS_COMPRA,
  type EstadoCompra,
} from "@/lib/retail";
import {
  bloquearCompra,
  bloquearProductos,
  ErrorRetail,
  reservasActivasPorProducto,
  transaccionTenant,
} from "@/lib/retail-db";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";

export const PATCH = conModulo(
  "compras",
  {},
  async (sesion, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const id = aBigInt((await params).id);
  if (id === null || sesion.orgId === null) {
    return NextResponse.json({ error: "Compra u organización inválidas" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const estado = String(body.estado ?? "") as EstadoCompra;
  if (!ESTADOS_COMPRA.includes(estado)) {
    return NextResponse.json({ error: "El estado no es válido" }, { status: 400 });
  }

  try {
    const compra = await transaccionTenant(sesion.orgId, async (tx) => {
      await bloquearCompra(tx, id);
      const actual = await tx.compra.findUnique({
        where: { id },
        include: { partidas: { include: { producto: true } } },
      });
      if (!actual) throw new ErrorRetail("Compra no encontrada", 404);
      const debeAplicar = compraUsaInventario(estado);
      if (debeAplicar !== actual.stockAplicado) {
        await bloquearProductos(
          tx,
          actual.partidas.map((partida) => partida.productoId),
        );
        const reservadas = await reservasActivasPorProducto(tx, actual.partidas.map((partida) => partida.productoId));
        for (const partida of actual.partidas) {
          const producto = await tx.producto.findUnique({ where: { id: partida.productoId } });
          if (!producto) throw new ErrorRetail("Uno de los productos ya no existe");
          const cambio = debeAplicar ? partida.cantidad : partida.cantidad.neg();
          const existenciaDespues = producto.stock.plus(cambio);
          if (existenciaDespues.minus(reservadas.get(String(producto.id)) ?? 0).lt(0)) {
            throw new ErrorRetail(`No es posible devolver ${producto.nombre}: stock insuficiente`);
          }
          await tx.producto.update({
            where: { id: producto.id },
            data: {
              stock: existenciaDespues,
              ...(debeAplicar ? { costo: partida.costoUnitario } : {}),
            },
          });
          await tx.movimientoInventario.create({
            data: {
              productoId: producto.id,
              compraId: actual.id,
              usuarioId: sesion.userId,
              tipo: debeAplicar ? "compra" : "devolucion_proveedor",
              cantidad: cambio,
              existenciaAntes: producto.stock,
              existenciaDespues,
              motivo: debeAplicar
                ? `Recepción ${actual.folio}`
                : `Reversión ${actual.folio}`,
            },
          });
        }
      }
      return tx.compra.update({
        where: { id },
        data: { estado, stockAplicado: debeAplicar },
        include: { proveedor: true, partidas: { include: { producto: true } } },
      });
    });
    return NextResponse.json(serializar({ compra }));
  } catch (error) {
    if (error instanceof ErrorRetail) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  },
);
