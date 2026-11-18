import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { sincronizarInsightsOrg, obtenerConexionPorOrg, guardarAccionResultado } from "@/lib/meta-ads/servicio";
import { esAccionResultado } from "@/lib/meta-ads/resultados";

export const GET = conModulo("meta_ads", {}, async (sesion) => {
  if (!sesion.userId) return NextResponse.json({ connection: null, insights: [] });
  const connection = await db.metaAdsConexion.findFirst({
    where: { orgId: sesion.orgId! },
    select: { id: true, adAccountId: true, estado: true, ultimoError: true }
  });
  if (!connection) return NextResponse.json({ connection: null, insights: [] });
  return NextResponse.json({ connection: { id: connection.id.toString(), adAccountId: connection.adAccountId, estado: connection.estado } });
});

export const POST = conModulo("meta_ads", { admin: true }, async (sesion, req: Request) => {
  const body = await req.json().catch(() => ({})) as { usuarioCrmId?: string };
  // El cron/admin puede indicar otra organización; la UI solo manda la sesión actual.
  const orgId = body.usuarioCrmId && /^\d+$/.test(body.usuarioCrmId)
    ? BigInt(body.usuarioCrmId)
    : sesion.orgId;
  if (!orgId) return NextResponse.json({ error: "Sesión sin organización" }, { status: 400 });
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

/** Guarda qué cuenta como "resultado" para la organización (meta_ads_conexiones.accion_resultado). */
export const PATCH = conModulo("meta_ads", { admin: true }, async (sesion, req: Request) => {
  const body = await req.json().catch(() => ({})) as { accionResultado?: unknown };
  if (!esAccionResultado(body.accionResultado)) {
    return NextResponse.json({ error: "Métrica de resultado inválida" }, { status: 400 });
  }
  if (!sesion.orgId) return NextResponse.json({ error: "Sesión sin organización" }, { status: 400 });
  await guardarAccionResultado(sesion.orgId, body.accionResultado);
  return NextResponse.json({ ok: true, accionResultado: body.accionResultado });
});
