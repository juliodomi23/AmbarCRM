import { NextRequest, NextResponse } from "next/server";
import { aBigInt } from "@/lib/ids";
import { requireModuloActivo } from "@/lib/modulos";
import { validarMovimiento } from "@/lib/retail";
import { bloquearProductos, ErrorRetail, transaccionTenant } from "@/lib/retail-db";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("productos");
  if (apagado) return apagado;
  const id = aBigInt((await params).id);
  if (id === null || sesion.orgId === null) {
    return NextResponse.json({ error: "Producto u organización inválidos" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const validacion = validarMovimiento(body);
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }

  try {
    const resultado = await transaccionTenant(sesion.orgId, async (tx) => {
      await bloquearProductos(tx, [id]);
      const producto = await tx.producto.findUnique({ where: { id } });
      if (!producto) throw new ErrorRetail("Producto no encontrado", 404);
      const cambio = validacion.tipo === "entrada" ? validacion.cantidad : -validacion.cantidad;
      const existenciaDespues = producto.stock + cambio;
      if (existenciaDespues < 0) throw new ErrorRetail("No hay existencias suficientes");
      const actualizado = await tx.producto.update({
        where: { id },
        data: { stock: existenciaDespues },
      });
      const movimiento = await tx.movimientoInventario.create({
        data: {
          productoId: id,
          usuarioId: sesion.userId,
          tipo: validacion.tipo,
          cantidad: cambio,
          existenciaAntes: producto.stock,
          existenciaDespues,
          motivo: validacion.motivo,
        },
      });
      return { producto: actualizado, movimiento };
    });
    return NextResponse.json(serializar(resultado), { status: 201 });
  } catch (error) {
    if (error instanceof ErrorRetail) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
