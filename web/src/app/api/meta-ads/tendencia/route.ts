import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { buscarTendenciaMetaAds } from "@/lib/meta-ads/tendencia-scraper";

export const dynamic = "force-dynamic";

/**
 * Tendencia: anuncios públicos de la industria.
 *
 * Antes se consultaba `ads_archive` con un token de app, pero Meta bloqueó esa
 * API por una verificación de identidad pendiente. Ahora se abre la biblioteca
 * pública con Playwright en el servidor y se extraen los mismos 2 campos:
 * pageName y adText. El contrato de respuesta no cambió.
 */
export const GET = conModulo("meta_ads", {}, async (_sesion, req: NextRequest) => {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ error: "Falta el parámetro de búsqueda 'q'" }, { status: 400 });
  }

  try {
    const anuncios = await buscarTendenciaMetaAds(q);
    const resultados = anuncios.slice(0, 10).map((anuncio, idx) => ({
      id: String(idx),
      pageName: anuncio.pageName,
      adText: anuncio.adText,
    }));

    return NextResponse.json({ resultados }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al buscar anuncios en Meta Ad Library" },
      { status: 502 },
    );
  }
});
