import { encode, getToken, type JWT } from "next-auth/jwt";
import type { NextRequest, NextResponse } from "next/server";

export const DURACION_SESION = 7 * 24 * 60 * 60;

export function nombreCookieSesion() {
  const secure = process.env.NEXTAUTH_URL?.startsWith("https://") ?? !!process.env.VERCEL;
  return `${secure ? "__Secure-" : ""}next-auth.session-token`;
}

export function sesionAnteriorAlCambio(token: JWT, cambiadaAt: Date | null) {
  const emitidoAt = token.emitidoAt ?? (token.iat ? token.iat * 1000 : 0);
  return !!cambiadaAt && emitidoAt < cambiadaAt.getTime();
}

export async function leerTokenSesion(req: NextRequest) {
  return getToken({ req });
}

export async function renovarSesionPassword(token: JWT, respuesta: NextResponse, cambiadaAt: Date, req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("Falta el secreto de sesión");
  const secure = process.env.NEXTAUTH_URL?.startsWith("https://") ?? !!process.env.VERCEL;
  const nombre = nombreCookieSesion();
  const opciones = { httpOnly: true, sameSite: "lax" as const, path: "/", secure };
  const valor = await encode({ secret, maxAge: DURACION_SESION, token: { ...token, emitidoAt: cambiadaAt.getTime(), checkedAt: Date.now(), revocado: false } });
  // NextAuth fragmenta cookies mayores de 3933 caracteres; elimina también los fragmentos previos.
  for (const cookie of req.cookies.getAll()) {
    if (cookie.name === nombre || cookie.name.startsWith(`${nombre}.`)) respuesta.cookies.set(cookie.name, "", { ...opciones, maxAge: 0 });
  }
  const fragmentos = Math.ceil(valor.length / 3933);
  for (let n = 0; n < fragmentos; n++) respuesta.cookies.set(fragmentos === 1 ? nombre : `${nombre}.${n}`, valor.slice(n * 3933, (n + 1) * 3933), { ...opciones, maxAge: DURACION_SESION });
}
