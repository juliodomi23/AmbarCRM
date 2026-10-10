import { NextRequest, NextResponse } from "next/server";
import { db, runWithOrg } from "@/lib/db";
import { orgDeTokenPedido } from "@/lib/pedidos-db";
import { errorPublico, limitarIp } from "@/lib/reservas/publico";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, { params }: Props) {
  const limitado = limitarIp(req, "tienda-seguimiento", 60, 60_000);
  if (limitado) return limitado;
  const token = (await params).token;
  const orgId = await orgDeTokenPedido(token);
  if (!orgId) return errorPublico("Pedido no encontrado", 404);
  return runWithOrg(orgId, async () => {
    const venta = await db.venta.findFirst({
      where: { tokenSeguimiento: token, canal: "tienda_en_linea" },
      include: { partidas: { include: { producto: { select: { nombre: true, unidad: true } } } } },
    });
    if (!venta) return errorPublico("Pedido no encontrado", 404);
    return NextResponse.json({
      folio: venta.folio, estado: venta.estado, total: venta.total.toFixed(2), tipoEntrega: venta.tipoEntrega,
      horarioDeseado: venta.horarioDeseado, createdAt: venta.createdAt,
      partidas: venta.partidas.map((p) => ({ nombre: p.producto.nombre, unidad: p.producto.unidad, cantidad: p.cantidad.toFixed(3) })),
    });
  });
}
