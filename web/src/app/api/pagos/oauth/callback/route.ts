import { NextRequest, NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import {
  COOKIE_OAUTH_PAGOS,
  guardarTokensOAuth,
  intercambiarCodigoOAuth,
  validarStateOAuth,
} from "@/lib/pagos/oauth";

function volver(estado: "conectado" | "error") {
  const base = process.env.PAGOS_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return new URL(`/configuracion?tab=modulos&pagos=${estado}`, base);
}

function borrarCookieOAuth(respuesta: NextResponse) {
  respuesta.cookies.set(COOKIE_OAUTH_PAGOS, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/pagos/oauth/callback",
    maxAge: 0,
  });
}

export async function GET(req: NextRequest) {
  const sesion = await requireSesion(true);
  if ("error" in sesion) return sesion.error;
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const nonce = req.cookies.get(COOKIE_OAUTH_PAGOS)?.value ?? "";
  const valido =
    sesion.orgId !== null &&
    sesion.userId !== null &&
    validarStateOAuth(state, nonce, sesion.orgId, sesion.userId);
  if (!valido || !code) {
    const respuesta = NextResponse.redirect(volver("error"));
    borrarCookieOAuth(respuesta);
    return respuesta;
  }
  try {
    const tokens = await intercambiarCodigoOAuth(code);
    await guardarTokensOAuth(sesion.orgId!, tokens);
    const respuesta = NextResponse.redirect(volver("conectado"));
    borrarCookieOAuth(respuesta);
    return respuesta;
  } catch {
    const respuesta = NextResponse.redirect(volver("error"));
    borrarCookieOAuth(respuesta);
    return respuesta;
  }
}
