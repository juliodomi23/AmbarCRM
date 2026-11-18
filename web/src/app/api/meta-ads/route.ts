import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { sincronizarInsightsOrg, obtenerConexionPorOrg, guardarAccionResultado, guardarUmbralesVeredicto } from "@/lib/meta-ads/servicio";
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

/**
 * Guarda la configuración del módulo que vive en `meta_ads_conexiones`:
 * - `accionResultado`: qué cuenta como resultado.
 * - `umbrales`: costo por resultado caro/barato (MXN).
 * Ambos son cálculo local: no hace falta resincronizar con Meta.
 */
export const PATCH = conModulo("meta_ads", { admin: true }, async (sesion, req: Request) => {
  const body = await req.json().catch(() => ({})) as {
    accionResultado?: unknown;
    umbrales?: { cpaMaximo?: unknown; cpaObjetivo?: unknown };
  };
  if (!sesion.orgId) return NextResponse.json({ error: "Sesión sin organización" }, { status: 400 });

  const tocaAccion = body.accionResultado !== undefined;
  const tocaUmbrales = body.umbrales !== undefined;
  if (!tocaAccion && !tocaUmbrales) {
    return NextResponse.json({ error: "No hay nada que guardar" }, { status: 400 });
  }

  const accion = esAccionResultado(body.accionResultado) ? body.accionResultado : null;
  if (tocaAccion && !accion) {
    return NextResponse.json({ error: "Métrica de resultado inválida" }, { status: 400 });
  }

  if (tocaUmbrales) {
    const cpaMaximo = Number(body.umbrales?.cpaMaximo);
    const cpaObjetivo = Number(body.umbrales?.cpaObjetivo);
    if (!Number.isFinite(cpaMaximo) || !Number.isFinite(cpaObjetivo) || cpaMaximo <= 0 || cpaObjetivo <= 0) {
      return NextResponse.json({ error: "Los dos montos deben ser números mayores a cero" }, { status: 400 });
    }
    if (cpaObjetivo >= cpaMaximo) {
      return NextResponse.json(
        { error: "El monto 'barato' debe ser menor que el monto 'caro'" },
        { status: 400 },
      );
    }
  }

  try {
    if (tocaAccion && accion) await guardarAccionResultado(sesion.orgId, accion);
    if (tocaUmbrales) {
      await guardarUmbralesVeredicto(sesion.orgId, {
        cpaMaximo: Number(body.umbrales?.cpaMaximo),
        cpaObjetivo: Number(body.umbrales?.cpaObjetivo),
      });
    }
  } catch (error) {
    // 42703 = columna inexistente: falta aplicar prisma/sql/actualizaciones.sql.
    const mensaje = error instanceof Error ? error.message : "";
    if (/42703|column .* does not exist/i.test(mensaje)) {
      return NextResponse.json(
        { error: "La base de datos todavía no tiene estas columnas. Falta aplicar prisma/sql/actualizaciones.sql como dueño de la BD." },
        { status: 500 },
      );
    }
    throw error;
  }

  return NextResponse.json({
    ok: true,
    ...(tocaAccion ? { accionResultado: body.accionResultado } : {}),
    ...(tocaUmbrales ? { umbrales: { cpaMaximo: Number(body.umbrales?.cpaMaximo), cpaObjetivo: Number(body.umbrales?.cpaObjetivo) } } : {}),
  });
});
