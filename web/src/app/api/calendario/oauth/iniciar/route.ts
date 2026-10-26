import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { COOKIE_OAUTH_CALENDARIO, crearStateCalendario, urlAutorizacionCalendario } from "@/lib/calendario/oauth";

export const GET = conModulo("calendario", {}, async (sesion, _req: NextRequest) => {
  if (sesion.orgId === null || sesion.userId === null) return NextResponse.json({ error: "La sesión no tiene organización" }, { status: 400 });
  try {
    const { state, cookie } = crearStateCalendario(sesion.orgId, sesion.userId);
    const response = NextResponse.redirect(urlAutorizacionCalendario(state));
    response.cookies.set(COOKIE_OAUTH_CALENDARIO, cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/calendario/oauth/callback", maxAge: 600 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "OAuth no disponible" }, { status: 503 });
  }
});
