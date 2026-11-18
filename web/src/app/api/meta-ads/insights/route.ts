import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { listarInsightsOrg, obtenerConexionPorOrg } from "@/lib/meta-ads/servicio";

export const GET = conModulo("meta_ads", {}, async (sesion) => {
  if (!sesion.userId) return NextResponse.json({ error: "Sesión sin usuario" }, { status: 400 });
  const connection = await db.metaAdsConexion.findFirst({
    where: { orgId: sesion.orgId!, estado: "activa" },
    select: { id: true, adAccountId: true, estado: true, sincronizadoAt: true, ultimoError: true }
  });
  if (!connection) return NextResponse.json({ connection: null, insights: [] });

  const [config, insights] = await Promise.all([
    obtenerConexionPorOrg(sesion.orgId!),
    listarInsightsOrg(sesion.orgId!),
  ]);

  return NextResponse.json({
    connection: {
      id: connection.id.toString(),
      adAccountId: connection.adAccountId,
      estado: connection.estado,
      sincronizadoAt: connection.sincronizadoAt?.toISOString?.() ?? null,
      ultimoError: connection.ultimoError,
      accionResultado: config?.accionResultado ?? null,
      cpaMaximo: config?.cpaMaximo ?? null,
      cpaObjetivo: config?.cpaObjetivo ?? null,
    },
    insights,
  });
});
