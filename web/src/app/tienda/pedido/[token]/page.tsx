import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { normalizarMarca, variablesMarca } from "@/lib/brand";
import { getAjustes } from "@/lib/services/config";
import { Badge, type TonoBadge } from "@/components/ui";
import { db, runWithOrg } from "@/lib/db";
import { orgDeTokenPedido } from "@/lib/pedidos-db";

export const dynamic = "force-dynamic";

const nombres: Record<string, string> = { pendiente: "Recibido", pagada: "Confirmado", preparando: "Preparando", lista: "Listo", entregada: "Entregado", cancelada: "Cancelado" };

const tonos: Record<string, TonoBadge> = { pendiente: "warning", pagada: "success", preparando: "info", lista: "info", entregada: "success", cancelada: "destructive" };

export default async function SeguimientoPedido({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const orgId = await orgDeTokenPedido(token);
  if (!orgId) notFound();
  const pedido = await runWithOrg(orgId, () => db.venta.findFirst({ where: { tokenSeguimiento: token, canal: "tienda_en_linea" }, select: { folio: true, estado: true, total: true, tipoEntrega: true, createdAt: true } }));
  if (!pedido) notFound();
  const marca = normalizarMarca(await runWithOrg(orgId, getAjustes));
  return (
    <div className="marca-local min-h-screen bg-background bg-mesh px-4 py-12 text-foreground" style={variablesMarca(marca) as CSSProperties}>
      <main className="surface surface-lift animate-fade-up mx-auto max-w-lg space-y-3 rounded-2xl p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Seguimiento de pedido</p>
        <h1 className="text-3xl font-bold">{pedido.folio}</h1>
        <h2 className="text-lg font-semibold"><Badge tono={tonos[pedido.estado] ?? "neutral"} punto className="px-3 py-1 text-sm">{nombres[pedido.estado] ?? pedido.estado}</Badge></h2>
        <p className="tnum text-base">Total: ${pedido.total.toFixed(2)}</p>
        <p className="text-sm text-muted-foreground">{pedido.tipoEntrega === "domicilio" ? "Entrega a domicilio" : "Recoger en tienda"}</p>
        <small className="block text-xs text-muted-foreground">Recibido {pedido.createdAt.toLocaleString("es-MX")}</small>
      </main>
    </div>
  );
}
