import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import {
  cambiarEstadoAnuncioMeta,
  registrarAccionAnuncio,
  ErrorPermisoMetaAds,
} from "@/lib/meta-ads/servicio";

export const dynamic = "force-dynamic";

type PropsAdId = { params: Promise<{ adId: string }> };

/**
 * Pausa o reanuda un anuncio que ya existe en la cuenta real de Meta.
 * Solo se permite ACTIVE <-> PAUSED: no crea anuncios ni cambia presupuestos.
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
