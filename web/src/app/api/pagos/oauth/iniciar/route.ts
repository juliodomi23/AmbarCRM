import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import {
  COOKIE_OAUTH_PAGOS,
  crearStateOAuth,
  urlAutorizacionMercadoPago,
} from "@/lib/pagos/oauth";

export const GET = conModulo(
  "pagos_en_linea",
  { admin: true },
  async (sesion, _req: NextRequest) => {
    if (sesion.orgId === null || sesion.userId === null)
      return NextResponse.json(
        { error: "La sesión no tiene organización" },
        { status: 400 },
      );
    try {
      const { state, cookie, codeChallenge } = crearStateOAuth(
        sesion.orgId,
        sesion.userId,
      );
      const respuesta = NextResponse.redirect(
        urlAutorizacionMercadoPago(state, codeChallenge),
      );
      respuesta.cookies.set(COOKIE_OAUTH_PAGOS, cookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/pagos/oauth/callback",
        maxAge: 10 * 60,
      });
      return respuesta;
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "OAuth no disponible" },
        { status: 503 },
      );
    }
  },
);
