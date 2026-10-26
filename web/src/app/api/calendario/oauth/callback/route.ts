import { NextRequest, NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import { COOKIE_OAUTH_CALENDARIO, guardarConexionCalendario, intercambiarCodigoCalendario, leerNonceCalendario, validarStateCalendario } from "@/lib/calendario/oauth";
import { zonaCalendarioOrg, sincronizarCalendario } from "@/lib/calendario/servicio";
import { requireModuloActivo } from "@/lib/modulos";

function destino(req: NextRequest, estado: string) {
  const url = new URL("/citas", process.env.NEXTAUTH_URL ?? req.url);
  url.searchParams.set("conexion", estado);
  return url;
}
function borrarCookie(response: NextResponse) {
  response.cookies.set(COOKIE_OAUTH_CALENDARIO, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/calendario/oauth/callback", maxAge: 0 });
}
export async function GET(req: NextRequest) {
  const sesion = await requireSesion(true);
  if ("error" in sesion) return NextResponse.redirect(new URL("/login?callbackUrl=/citas", req.url));
  const denegada = await requireModuloActivo("calendario", sesion);
  if (denegada) return denegada;
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const error = req.nextUrl.searchParams.get("error");
  const nonce = leerNonceCalendario(req.cookies.get(COOKIE_OAUTH_CALENDARIO)?.value ?? "");
  let valid = false;
  try { valid = Boolean(!error && code && nonce && sesion.orgId && sesion.userId && validarStateCalendario(state, nonce!, sesion.orgId!, sesion.userId!)); }
  catch { valid = false; }
  if (!valid) { const response = NextResponse.redirect(destino(req, "error")); borrarCookie(response); return response; }
  try {
    const tokens = await intercambiarCodigoCalendario(code);
    await guardarConexionCalendario(sesion.orgId!, sesion.userId!, tokens, await zonaCalendarioOrg());
    await sincronizarCalendario(sesion.orgId!, sesion.userId!).catch(() => undefined);
    const response = NextResponse.redirect(destino(req, "conectado")); borrarCookie(response); return response;
  } catch {
    const response = NextResponse.redirect(destino(req, "error")); borrarCookie(response); return response;
  }
}
