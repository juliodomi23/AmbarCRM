import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { sincronizarInsightsOrg, obtenerConexionPorOrg } from "@/lib/meta-ads/servicio";

export const GET = conModulo("meta_ads", {}, async (sesion) => {
  if (!sesion.userId) return NextResponse.json({ connection: null, insights: [] });
  const connection = await db.metaAdsConexion.findFirst({
    where: { orgId: sesion.orgId! },
    select: { id: true, adAccountId: true, estado: true, ultimoError: true }
  });
  if (!connection) return NextResponse.json({ connection: null, insights: [] });
  return NextResponse.json({ connection: { id: connection.id.toString(), adAccountId: connection.adAccountId, estado: connection.estado } });
});

export const POST = conModulo("meta_ads", { admin: true }, async (_sesion, req: Request) => {
  const body = await req.json();
  if (!body.usuarioCrmId || !/^\d+$/.test(body.usuarioCrmId)) return NextResponse.json({ error: "Usuario inválido" }, { status: 400 });
  const orgId = BigInt(body.usuarioCrmId);
  try {
    const conexion = await obtenerConexionPorOrg(orgId);
    if (!conexion) {
      return NextResponse.json({ error: "No hay conexión de Meta Ads activa para esta organización" }, { status: 404 });
    }
    await sincronizarInsightsOrg(orgId, conexion.adAccountId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
});