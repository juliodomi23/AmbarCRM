import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import {
  cambiarEstadoAnuncioMeta,
  registrarAccionAnuncio,
  listarInsightsRango,
  obtenerCreativoAnuncio,
  listarAccionesAnuncio,
  ErrorPermisoMetaAds,
} from "@/lib/meta-ads/servicio";

export const dynamic = "force-dynamic";

type PropsAdId = { params: Promise<{ adId: string }> };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Detalle de un anuncio para el modal: serie diaria del período seleccionado
 * (listarInsightsRango), creativo traído al vuelo de Meta (no se guarda en BD)
 * y el historial de pausas/reanudados con el nombre de quién lo hizo.
 */
export const GET = conModulo("meta_ads", {}, async (sesion, req: NextRequest, props: PropsAdId) => {
  const { adId } = await props.params;
  if (!/^\d+$/.test(adId)) {
    return NextResponse.json({ error: "Anuncio inválido" }, { status: 400 });
  }
  if (!sesion.orgId) {
    return NextResponse.json({ error: "Sesión sin organización" }, { status: 400 });
  }

  const desde = req.nextUrl.searchParams.get("desde") ?? "";
  const hasta = req.nextUrl.searchParams.get("hasta") ?? "";
  if (!FECHA.test(desde) || !FECHA.test(hasta)) {
    return NextResponse.json({ error: "Faltan las fechas desde y hasta (YYYY-MM-DD)" }, { status: 400 });
  }
  if (desde > hasta) {
    return NextResponse.json({ error: "La fecha 'desde' no puede ser posterior a 'hasta'" }, { status: 400 });
  }

  const [insumos, creativo, acciones] = await Promise.all([
    listarInsightsRango(sesion.orgId, adId, desde, hasta),
    obtenerCreativoAnuncio(sesion.orgId, adId),
    listarAccionesAnuncio(sesion.orgId, adId),
  ]);

  // Una sola métrica canónica por día (como en la tabla): si no hay resultados, es 0.
  const dias = insumos.map((d) => ({ ...d, resultados: d.cpa > 0 ? d.spend / d.cpa : 0 }));

  const gasto = dias.reduce((total, d) => total + d.spend, 0);
  const impresiones = dias.reduce((total, d) => total + d.impresiones, 0);
  const alcance = dias.reduce((total, d) => total + d.reach, 0);
  const resultados = dias.reduce((total, d) => total + d.resultados, 0);
  const totales = {
    gasto,
    impresiones,
    alcance,
    resultados,
    ctr: dias.length ? dias.reduce((total, d) => total + d.ctr, 0) / dias.length : 0,
    cpa: resultados > 0 ? gasto / resultados : 0,
    cpm: impresiones > 0 ? (gasto / impresiones) * 1000 : 0,
  };

  return NextResponse.json(
    { adId, desde, hasta, insights: dias, totales, creativo, acciones },
    { headers: { "Cache-Control": "no-store" } },
  );
});

/**
 * Pausa o reanuda un anuncio REAL en Meta (POST /<adId> con status).
 * Solo se permite ACTIVE <-> PAUSED: no crea anuncios ni toca presupuestos.
 */
export const PATCH = conModulo("meta_ads", { admin: true }, async (sesion, req: NextRequest, props: PropsAdId) => {
  const { adId } = await props.params;
  if (!/^\d+$/.test(adId)) {
    return NextResponse.json({ error: "Anuncio inválido" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({})) as { estado?: unknown };
  if (body.estado !== "ACTIVE" && body.estado !== "PAUSED") {
    return NextResponse.json({ error: "Estado inválido: usa ACTIVE o PAUSED" }, { status: 400 });
  }
  if (!sesion.orgId) {
    return NextResponse.json({ error: "Sesión sin organización" }, { status: 400 });
  }

  const estado = body.estado;

  try {
    await cambiarEstadoAnuncioMeta(sesion.orgId, adId, estado);
  } catch (error) {
    if (error instanceof ErrorPermisoMetaAds) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cambiar el anuncio en Meta" },
      { status: 502 },
    );
  }

  // Bitácora: quién pausó/reanudó qué anuncio y cuándo.
  await registrarAccionAnuncio(sesion.orgId, adId, sesion.userId, estado === "PAUSED" ? "pausar" : "reanudar");

  return NextResponse.json(
    { ok: true, adId, estado },
    { headers: { "Cache-Control": "no-store" } },
  );
});
