import { notFound } from "next/navigation";
import { db, runWithOrg } from "@/lib/db";
import { orgDeTokenPedido } from "@/lib/pedidos-db";

export const dynamic = "force-dynamic";

const nombres: Record<string, string> = { pendiente: "Recibido", pagada: "Confirmado", preparando: "Preparando", lista: "Listo", entregada: "Entregado", cancelada: "Cancelado" };

export default async function SeguimientoPedido({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const orgId = await orgDeTokenPedido(token);
  if (!orgId) notFound();
  const pedido = await runWithOrg(orgId, () => db.venta.findFirst({ where: { tokenSeguimiento: token, canal: "tienda_en_linea" }, select: { folio: true, estado: true, total: true, tipoEntrega: true, createdAt: true } }));
  if (!pedido) notFound();
  return <main style={{ maxWidth: 560, margin: "80px auto", padding: 24, fontFamily: "sans-serif" }}><p>SEGUIMIENTO DE PEDIDO</p><h1>{pedido.folio}</h1><h2>{nombres[pedido.estado] ?? pedido.estado}</h2><p>Total: ${pedido.total.toFixed(2)}</p><p>{pedido.tipoEntrega === "domicilio" ? "Entrega a domicilio" : "Recoger en tienda"}</p><small>Recibido {pedido.createdAt.toLocaleString("es-MX")}</small></main>;
}
