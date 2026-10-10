import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { TiendaPublica } from "@/components/pedidos/TiendaPublica";
import { normalizarMarca, variablesMarca } from "@/lib/brand";
import { runWithOrg } from "@/lib/db";
import { negocioPublico } from "@/lib/pedidos-db";
import { getAjustes } from "@/lib/services/config";

export const dynamic = "force-dynamic";

export default async function TiendaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const negocio = await negocioPublico(slug);
  if (!negocio) notFound();
  const marca = normalizarMarca(await runWithOrg(negocio.orgId, getAjustes));
  return <div className="marca-local" style={variablesMarca(marca) as CSSProperties}><TiendaPublica slug={slug} /></div>;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const negocio = await negocioPublico((await params).slug);
  return { title: negocio ? `Tienda · ${negocio.nombre}` : "Tienda" };
}
