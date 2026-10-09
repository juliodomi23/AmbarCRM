import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { ReservaPublica } from "@/components/reservas/ReservaPublica";
import { runWithOrg } from "@/lib/db";
import { normalizarMarca, variablesMarca } from "@/lib/brand";
import { negocioPublico } from "@/lib/reservas/servidor";
import { getAjustes } from "@/lib/services/config";

export const dynamic = "force-dynamic";

/** Página pública para agendar: no pide sesión; la marca es la del negocio. */
export default async function ReservarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const negocio = await negocioPublico(slug);
  if (!negocio) notFound();
  const marca = normalizarMarca(await runWithOrg(negocio.orgId, getAjustes));
  return (
    <div className="marca-local" style={variablesMarca(marca) as CSSProperties}>
      <ReservaPublica slug={slug} />
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const negocio = await negocioPublico((await params).slug);
  return { title: negocio ? `Agenda tu cita · ${negocio.nombre}` : "Agenda tu cita" };
}
