import { TallerAprobacionPublica } from "@/components/taller/TallerAprobacionPublica";
import { notFound } from "next/navigation";
import { db, runWithOrg } from "@/lib/db";
import { normalizarMarca, variablesMarca } from "@/lib/brand";
import type { CSSProperties } from "react";

export default async function TallerAprobacionPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const match = /^(\d+)-([a-f0-9]{48})$/.exec(token);
  if (!match) notFound();
  const vista = await runWithOrg(BigInt(match[1]), async () => {
    const modulo = await db.moduloOrg.findFirst({ where: { clave: "taller", activo: true }, select: { id: true } });
    const orden = modulo ? await db.tallerOrden.findFirst({ where: { aprobacionToken: match[2], estado: "esperando_aprobacion" }, select: { id: true } }) : null;
    if (!orden) return null;
    const ajustes = await db.ajustes.findUnique({ where: { orgId: BigInt(match[1]) }, select: { marcaNombre: true, marcaLogo: true, marcaColorPrimario: true, marcaColorAcento: true, marcaPreset: true } });
    const marca = normalizarMarca(ajustes);
    return { nombre: marca.nombre, logo: marca.logo, estilo: variablesMarca(marca) as CSSProperties };
  });
  if (!vista) notFound();
  return <main style={vista.estilo} className="min-h-svh bg-background px-4 py-6 sm:px-6 sm:py-10"><TallerAprobacionPublica token={token} marca={vista} /></main>;
}
