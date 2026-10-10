import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { svgCode128 } from "@/lib/code128";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";

export const GET = conModulo("productos", {}, async (_sesion, _req, { params }: { params: Promise<{ id: string }> }) => {
  const id = aBigInt((await params).id);
  if (id === null) return NextResponse.json({ error: "Producto inválido" }, { status: 400 });
  const producto = await db.producto.findUnique({ where: { id }, select: { sku: true, codigoBarras: true } });
  if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  const codigo = producto.codigoBarras ?? producto.sku;
  if (!codigo) return NextResponse.json({ error: "El producto no tiene código ni SKU" }, { status: 409 });
  try {
    return new NextResponse(svgCode128(codigo), { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Código inválido" }, { status: 400 });
  }
});
