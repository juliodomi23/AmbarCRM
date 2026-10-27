import authMiddleware from "next-auth/middleware";
import { getToken } from "next-auth/jwt";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { nombreCookieSesion } from "@/lib/password-sesion";

const middlewareWeb = authMiddleware({ callbacks: { authorized: ({ token }) => !!token && !token.revocado } });

export default async function proxy(req: NextRequest, event: NextFetchEvent) {
  const nombre = nombreCookieSesion();
  const tieneCookie = req.cookies.has(nombre) || req.cookies.has(`${nombre}.0`);
  const bearer = req.headers.get("authorization")?.startsWith("Bearer ") ?? false;
  const esMedia = req.nextUrl.pathname.startsWith("/api/media/");

  if (!bearer || tieneCookie) return esMedia ? NextResponse.next() : middlewareWeb(req as Parameters<typeof middlewareWeb>[0], event);

  const token = await getToken({ req });
  if (!token || token.revocado) {
    return esMedia ? NextResponse.next() : NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const valor = req.headers.get("authorization")!.slice(7);
  const headers = new Headers(req.headers);
  headers.set("cookie", `${req.headers.get("cookie") ? `${req.headers.get("cookie")}; ` : ""}${nombre}=${valor}`);
  return NextResponse.next({ request: { headers } });
}

// Protege todo menos login, api/auth y las rutas que validan su propio token.
export const config = {
  matcher: ["/((?!login|recuperar(?:/|$)|restablecer/|demo(?:/|$)|opinion/|cotizacion/|tienda/|reservar/|privacidad|terminos|eliminacion-datos|api/auth(?:/|$)|api/movil/login(?:/|$)|api/meta/webhook(?:/|$)|api/canal-api/|api/messenger/webhook(?:/|$)|api/instagram/webhook(?:/|$)|api/public|api/v1|api/cron|api/servidores/heartbeat(?:/|$)|api/panel-ar/alertas(?:/|$)|_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon.png|icon-192.png|icon-512.png|apple-icon.png).*)"]
};
