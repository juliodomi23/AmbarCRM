import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { dinero } from "@/lib/dinero";
import { ErrorRetail, transaccionTenant } from "@/lib/retail-db";

export const PATCH = conModulo("productos", { admin: true }, async (sesion, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.productos) || body.productos.length < 1 || body.productos.length > 1000) return NextResponse.json({ error: "Envía entre 1 y 1,000 productos" }, { status: 400 });
  const errores: Array<{ renglon: number; mensaje: string }> = [];
  const cambios: Array<{ id: bigint; precio?: Prisma.Decimal; activo?: boolean; agotadoManual?: boolean }> = body.productos.flatMap((valor: Record<string, unknown>, indice: number) => {
    const idTexto = String(valor?.id ?? "");
    const precio = valor.precio === undefined ? undefined : dinero(valor.precio);
    if (!/^\d+$/.test(idTexto)) errores.push({ renglon: indice + 1, mensaje: "Producto inválido" });
    if (valor.precio !== undefined && precio === null) errores.push({ renglon: indice + 1, mensaje: "Precio inválido" });
    return /^\d+$/.test(idTexto) && precio !== null ? [{ id: BigInt(idTexto), precio: precio === undefined ? undefined : new Prisma.Decimal(String(precio)), activo: typeof valor.activo === "boolean" ? valor.activo : undefined, agotadoManual: typeof valor.agotadoManual === "boolean" ? valor.agotadoManual : undefined }] : [];
  });
  if (errores.length) return NextResponse.json({ error: "Hay errores en el lote", errores }, { status: 400 });
  try {
    await transaccionTenant(sesion.orgId!, async (tx) => {
      const propios = await tx.producto.count({ where: { id: { in: cambios.map((cambio) => cambio.id) } } });
      if (propios !== cambios.length) throw new ErrorRetail("Uno de los productos no pertenece a la empresa", 404);
      for (const cambio of cambios) await tx.producto.update({ where: { id: cambio.id }, data: { precio: cambio.precio, activo: cambio.activo, agotadoManual: cambio.agotadoManual } });
    });
  } catch (error) {
    if (error instanceof ErrorRetail) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  return NextResponse.json({ ok: true, actualizados: cambios.length });
});
