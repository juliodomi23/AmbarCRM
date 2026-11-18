import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { COOKIE_OAUTH_META_ADS, crearStateMetaAds, urlAutorizacionMetaAds, validarStateMetaAds } from "@/lib/meta-ads/oauth";
import { requireSesion } from "@/lib/session";

export const GET = conModulo("meta_ads", {}, async (sesion, req: NextRequest) => {
  if (sesion.orgId === null || sesion.userId === null) return NextResponse.json({ error: "La sesión no tiene organización" }, { status: 400 });
  const clienteIdParam = req.nextUrl.searchParams.get("clienteId");
  if (!clienteIdParam || !/^\d+$/.test(clienteIdParam)) {
    return NextResponse.json({ error: "Falta clienteId" }, { status: 400 });
  }
  try {
    const { state, cookie } = crearStateMetaAds(sesion.orgId, sesion.userId, BigInt(clienteIdParam));
    const response = NextResponse.redirect(urlAutorizacionMetaAds(state));
    response.cookies.set(COOKIE_OAUTH_META_ADS, cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/meta-ads/oauth/callback", maxAge: 600 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "OAuth no disponible" }, { status: 503 });
  }
});