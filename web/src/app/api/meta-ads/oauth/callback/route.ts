import { NextRequest, NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import { requireModuloActivo } from "@/lib/modulos";
import { COOKIE_OAUTH_META_ADS, leerNonceMetaAds, leerClienteIdMetaAds, validarStateMetaAds, intercambiarCodigoMetaAds, guardarConexionMetaAds, listarCuentasPublicitarias } from "@/lib/meta-ads/oauth";
import { sincronizarInsightsOrg } from "@/lib/meta-ads/servicio";

function destino(req: NextRequest, estado: string) {
  const url = new URL("/meta-ads", process.env.NEXTAUTH_URL ?? req.url);
  url.searchParams.set("conexion", estado);
  return url;
}

function borrarCookie(response: NextResponse) {
  response.cookies.set(COOKIE_OAUTH_META_ADS, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/meta-ads/oauth/callback", maxAge: 0 });
}

export async function GET(req: NextRequest) {
  const sesion = await requireSesion(true);
  if ("error" in sesion) return NextResponse.redirect(new URL("/login?callbackUrl=/meta-ads", req.url));
  const denegada = await requireModuloActivo("meta_ads", sesion);
  if (denegada) return denegada;

  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const error = req.nextUrl.searchParams.get("error");
  const nonce = leerNonceMetaAds(req.cookies.get(COOKIE_OAUTH_META_ADS)?.value ?? "");
  // El clienteId real viene dentro del state firmado; no se acepta del query.
  const clienteIdRaw = leerClienteIdMetaAds(state);
  const clienteId = clienteIdRaw && /^\d+$/.test(clienteIdRaw) ? BigInt(clienteIdRaw) : null;
  let valid = false;
  try {
    valid = Boolean(!error && code && nonce && sesion.orgId && sesion.userId && clienteId && validarStateMetaAds(state, nonce!, sesion.orgId!, sesion.userId!, clienteId!));
  } catch { valid = false; }
  if (!valid) {
    const response = NextResponse.redirect(destino(req, "error"));
    borrarCookie(response);
    return response;
  }

  try {
    const tokens = await intercambiarCodigoMetaAds(code);

    // Llamamos listarCuentasPublicitarias para obtener cuentas del token.
    // Si solo hay una, la guardamos directamente. Si hay varias, guardamos placeholder y redirigimos a /meta-ads?conexion=elegir-cuenta.
    const cuentas = await listarCuentasPublicitarias(tokens.access_token);

    let adAccountIdParaGuardar: string;
    let redirectEstado: string;
    if (cuentas.length === 1) {
      // Solo hay una cuenta; la guardamos directamente.
      adAccountIdParaGuardar = cuentas[0].id;
      redirectEstado = "conectado";
    } else {
      // Varias cuentas: guardamos placeholder y redirigimos a /meta-ads?conexion=elegir-cuenta.
      adAccountIdParaGuardar = "<temp>";
      redirectEstado = "elegir-cuenta";
    }

    // Guardamos la conexión (con placeholder si es necesario) para que GET /api/meta-ads/insights devuelva connection.
    await guardarConexionMetaAds(sesion.orgId!, sesion.userId!, clienteId!, adAccountIdParaGuardar, tokens.access_token, null, new Date(Date.now() + tokens.expires_in * 1000));
    await sincronizarInsightsOrg(sesion.orgId!, clienteId!, adAccountIdParaGuardar).catch(() => undefined);

    const response = NextResponse.redirect(destino(req, redirectEstado));
    borrarCookie(response);
    return response;
  } catch {
    const response = NextResponse.redirect(destino(req, "error"));
    borrarCookie(response);
    return response;
  }
}