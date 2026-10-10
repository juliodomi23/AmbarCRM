import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { OpinionPublica } from "@/components/resenas/OpinionPublica";
import { normalizarMarca, variablesMarca } from "@/lib/brand";
import { runWithOrg } from "@/lib/db";
import { origenValido } from "@/lib/resenas";
import { negocioResenas } from "@/lib/resenas-db";
import { getAjustes } from "@/lib/services/config";

export const dynamic = "force-dynamic";

export default async function OpinionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ o?: string | string[] }>;
}) {
  const { slug } = await params;
  const { o } = await searchParams;
  const negocio = await negocioResenas(slug);
  if (!negocio) notFound();
  const marca = normalizarMarca(await runWithOrg(negocio.orgId, getAjustes));
  return (
    <div className="marca-local" style={variablesMarca(marca) as CSSProperties}>
      <OpinionPublica slug={slug} nombre={negocio.nombre} enlaceGoogle={negocio.enlaceGoogle} origen={origenValido(Array.isArray(o) ? o[0] : o)} />
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const negocio = await negocioResenas((await params).slug);
  return { title: negocio ? `Tu opinión · ${negocio.nombre}` : "Opinión", robots: { index: false } };
}
