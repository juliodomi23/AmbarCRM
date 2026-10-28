import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { requireSesion } from "@/lib/session";
import { conectarInstagramLogin } from "@/lib/services/messenger-login";
import { COOKIE_INSTAGRAM_OAUTH, OPCIONES_INSTAGRAM_OAUTH } from "@/lib/meta/messenger-login-http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const retorno = new URL("/configuracion", process.env.NEXTAUTH_URL || req.url);
  const cookie = req.cookies.get(COOKIE_INSTAGRAM_OAUTH)?.value ?? "";
  const [id, nombre] = cookie.split(":", 2);
  let mensaje = "Instagram no autorizó la conexión.";
  try {
    const sesion = await requireSesion(true);
    const sessionToken = await getToken({ req, raw: true });
    if ("error" in sesion || !sesion.orgId || !sesion.userId || !sessionToken) throw new Error("Inicia sesión como administrador y vuelve a conectar Instagram.");
    const errorMeta = req.nextUrl.searchParams.get("error");
    if (errorMeta) throw new Error("Se canceló la autorización de Instagram.");
    await conectarInstagramLogin({ orgId: sesion.orgId, userId: sesion.userId, sessionToken }, id ?? "",
      req.nextUrl.searchParams.get("state"), req.nextUrl.searchParams.get("code"), retorno.origin,
      nombre ? decodeURIComponent(nombre) : undefined);
    mensaje = "Cuenta de Instagram conectada.";
    retorno.searchParams.set("instagram", "ok");
  } catch (error) {
    mensaje = error instanceof Error ? error.message : mensaje;
    retorno.searchParams.set("instagram", "error");
  }
  retorno.searchParams.set("instagram_mensaje", mensaje);
  const res = NextResponse.redirect(retorno);
  res.cookies.set(COOKIE_INSTAGRAM_OAUTH, "", { ...OPCIONES_INSTAGRAM_OAUTH, maxAge: 0 });
  return res;
}
