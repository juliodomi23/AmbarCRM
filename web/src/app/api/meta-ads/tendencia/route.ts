import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { tokenAppMetaAds } from "@/lib/meta-ads/tendencia";

export const dynamic = "force-dynamic";

export const GET = conModulo("meta_ads", {}, async (_sesion, req: NextRequest) => {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ error: "Falta el parámetro de búsqueda 'q'" }, { status: 400 });
  }

  try {
    // Ad Library usa un token de app (client_credentials), no el token ads_read del cliente.
    const appToken = await tokenAppMetaAds();

    const url = new URL("https://graph.facebook.com/v26.0/ads_archive");
    url.searchParams.set("search_terms", q);
    url.searchParams.set("ad_reached_countries", '["MX"]');
    url.searchParams.set("ad_active_status", "ACTIVE");
    url.searchParams.set("fields", "page_name,ad_creative_body");
    url.searchParams.set("limit", "10");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${appToken}` },
      cache: "no-store",
    });

    if (!response.ok) {
      const error = await response.text().catch(() => "");
      return NextResponse.json({ error: `Meta devolvió ${response.status}: ${error}` }, { status: 502 });
    }

    const data = await response.json() as {
      data?: Array<{ page_name?: string; ad_creative_body?: string }>;
      error?: { message?: string };
    };
    if (data.error) {
      return NextResponse.json({ error: data.error.message || "Error de Meta en ads_archive" }, { status: 502 });
    }

    const resultados = (data.data ?? []).map((d, idx) => ({
      id: String(idx),
      pageName: d.page_name ?? "",
      adText: d.ad_creative_body ?? "",
    }));

    return NextResponse.json({ resultados }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error al buscar en Meta Ad Library" }, { status: 502 });
  }
});
