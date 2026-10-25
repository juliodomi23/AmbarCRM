import { NextRequest, NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import {
  COOKIE_OAUTH_PAGOS,
  guardarTokensOAuth,
  intercambiarCodigoOAuth,
  leerCookieOAuth,
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
  const errorSesion = "error" in sesion ? sesion.error : undefined;
  if (errorSesion) {
    if (errorSesion.status === 401) {
      const login = new URL("/login", req.url);
      login.searchParams.set(
        "callbackUrl",
        "/configuracion?tab=modulos&pagos=error",
      );
      return NextResponse.redirect(login);
    }
    return errorSesion;
  }
  const orgId = sesion.orgId ?? null;
  const userId = sesion.userId ?? null;
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const cookie = leerCookieOAuth(
    req.cookies.get(COOKIE_OAUTH_PAGOS)?.value ?? "",
  );
  let valido = false;
  try {
    valido =
      orgId !== null &&
      userId !== null &&
      cookie !== null &&
      validarStateOAuth(state, cookie.nonce, orgId, userId);
  } catch {
    valido = false;
  }
  if (!valido || !code) {
    const respuesta = NextResponse.redirect(volver("error"));
    borrarCookieOAuth(respuesta);
    return respuesta;
  }
  try {
    const tokens = await intercambiarCodigoOAuth(code, cookie?.codeVerifier);
    await guardarTokensOAuth(orgId!, tokens);
    const respuesta = NextResponse.redirect(volver("conectado"));
    borrarCookieOAuth(respuesta);
    return respuesta;
  } catch {
    const respuesta = NextResponse.redirect(volver("error"));
    borrarCookieOAuth(respuesta);
    return respuesta;
  }
}
