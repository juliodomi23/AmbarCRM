import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validarCredenciales } from "@/lib/auth-credenciales";
import { respuestaTokenMovil } from "@/lib/auth-movil";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.org !== "string" || !body.org.trim() ||
      typeof body?.email !== "string" || !body.email.trim() ||
      typeof body?.password !== "string" || !body.password) {
    return NextResponse.json({ error: "solicitud inválida" }, { status: 400 });
  }
  const headers = Object.fromEntries(req.headers.entries());
  const usuario = await validarCredenciales({ email: body.email, password: body.password,
    orgSlug: body.org, headers });
  if (!usuario) return NextResponse.json({ error: "credenciales inválidas" },
    { status: 401, headers: { "Cache-Control": "no-store" } });
  const org = await db.org.findUnique({ where: { id: BigInt(usuario.orgId) }, select: { slug: true, nombre: true } });
  if (!org) return NextResponse.json({ error: "credenciales inválidas" }, { status: 401 });
  return respuestaTokenMovil(usuario, org);
}
