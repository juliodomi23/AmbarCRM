import { encode, type JWT } from "next-auth/jwt";
import { NextResponse } from "next/server";
import { DURACION_SESION } from "@/lib/password-sesion";

type UsuarioToken = { id: string; name?: string | null; email?: string | null;
  rol: "admin" | "agente"; orgId: string; puesto: string };

export async function respuestaTokenMovil(usuario: UsuarioToken, org: { slug: string; nombre: string }, emitidoAt = Date.now()) {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("Falta el secreto de sesión");
  const token: JWT = { sub: usuario.id, name: usuario.name, email: usuario.email,
    id: usuario.id, rol: usuario.rol, orgId: usuario.orgId, puesto: usuario.puesto,
    emitidoAt, checkedAt: Date.now() };
  const valor = await encode({ secret, maxAge: DURACION_SESION, token });
  if (valor.length > 3933) throw new Error("El token móvil excede el tamaño de una cookie");
  return NextResponse.json({ token: valor,
    expiraEn: new Date(Date.now() + DURACION_SESION * 1000).toISOString(),
    usuario: { id: usuario.id, nombre: usuario.name, rol: usuario.rol, puesto: usuario.puesto },
    org: { slug: org.slug, nombre: org.nombre } },
  { headers: { "Cache-Control": "no-store" } });
}

export function noAutorizadoMovil() {
  return NextResponse.json({ error: "no autorizado" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}
