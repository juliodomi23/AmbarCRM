import { NextRequest, NextResponse } from "next/server";
import { aBigInt } from "@/lib/ids";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { requireSesion } from "@/lib/session";
import { getEmbudoConTarjetas } from "@/lib/services/embudos";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;

  const id = aBigInt((await params).id);
  if (!id) return NextResponse.json({ error: "embudo inválido" }, { status: 400 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const pagina = Math.floor(Math.max(1, Math.min(10000, Number(req.nextUrl.searchParams.get("pagina")) || 1)));
  const embudo = await getEmbudoConTarjetas(id, { q, pagina });
  if (!embudo || !embudo.activo) return NextResponse.json({ error: "embudo no encontrado" }, { status: 404 });

  const etapas = embudo.etapas.map((etapa) => ({
    id: String(etapa.id), nombre: etapa.nombre, color: etapa.color,
    tipo: etapa.tipo, orden: etapa.orden, total: etapa._count.oportunidades,
    tarjetas: etapa.oportunidades.map((oportunidad) => ({
      id: String(oportunidad.id),
      titulo: (oportunidad.campos as { valorAnual?: unknown } | null)?.valorAnual
        ? `${oportunidad.titulo} · incluye valor anual` : oportunidad.titulo,
      valor: Number(oportunidad.valor), moneda: oportunidad.moneda,
      estado: oportunidad.estado, createdAt: oportunidad.createdAt.toISOString(),
      diasEnEtapa: Math.max(0, Math.floor((Date.now() - oportunidad.createdAt.getTime()) / 86400000)),
      conversacionId: oportunidad.contacto.conversaciones[0]?.id
        ? String(oportunidad.contacto.conversaciones[0].id) : null,
      contacto: { nombre: oportunidad.contacto.nombre, telefono: oportunidad.contacto.telefono },
      responsable: oportunidad.responsable ? { nombre: oportunidad.responsable.nombre } : null,
    })),
  }));
  return NextResponse.json({
    id: String(embudo.id), nombre: embudo.nombre, pagina,
    paginas: Math.max(1, ...etapas.map((etapa) => Math.ceil(etapa.total / LIMITE_PANEL))),
    limitePorColumna: LIMITE_PANEL, etapas,
  }, { headers: { "Cache-Control": "no-store" } });
}
