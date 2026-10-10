import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { dinero } from "@/lib/dinero";
import { bloquearProductos, ErrorRetail, transaccionTenant } from "@/lib/retail-db";

type Cambio = { id: bigint; precio: Prisma.Decimal; visibleEnLinea: boolean; agotadoManual: boolean; etiquetasEnLinea: string[] };

export const PATCH = conModulo("pedidos_en_linea", { admin: true }, async (sesion, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.productos) || body.productos.length === 0 || body.productos.length > 200) return NextResponse.json({ error: "Revisa los productos" }, { status: 400 });
  const cambios: Cambio[] = [];
  for (const valor of body.productos) {
    const id = String(valor?.id ?? "");
    const precio = dinero(valor?.precio);
    if (!/^\d+$/.test(id) || precio === null) return NextResponse.json({ error: "Hay un precio o producto inválido" }, { status: 400 });
    const etiquetas = Array.isArray(valor.etiquetasEnLinea) ? valor.etiquetasEnLinea : String(valor.etiquetasEnLinea ?? "").split(",");
    cambios.push({ id: BigInt(id), precio: new Prisma.Decimal(String(precio)), visibleEnLinea: Boolean(valor.visibleEnLinea), agotadoManual: Boolean(valor.agotadoManual), etiquetasEnLinea: etiquetas.map((e: unknown) => String(e).trim()).filter(Boolean).slice(0, 10) });
  }
  await transaccionTenant(sesion.orgId!, async (tx) => {
    await bloquearProductos(tx, cambios.map((c) => c.id));
    const propios = await tx.producto.findMany({ where: { id: { in: cambios.map((c) => c.id) } }, select: { id: true } });
    if (propios.length !== cambios.length) throw new ErrorRetail("Uno de los productos no pertenece a la empresa", 404);
    for (const cambio of cambios) await tx.producto.update({ where: { id: cambio.id }, data: { precio: cambio.precio, visibleEnLinea: cambio.visibleEnLinea, agotadoManual: cambio.agotadoManual, etiquetasEnLinea: cambio.etiquetasEnLinea } });
  });
  return NextResponse.json({ ok: true });
});
