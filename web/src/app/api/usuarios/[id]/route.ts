import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Editar usuario. Body: { nombre?, rol?, activo?, password? } */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("nombre" in body) data.nombre = body.nombre;
  if ("rol" in body) data.rol = body.rol === "admin" ? "admin" : "agente";
  if ("activo" in body) data.activo = !!body.activo;
  if (body.password) {
    if (String(body.password).length < 8) {
      return NextResponse.json({ error: "la contraseña debe tener al menos 8 caracteres" }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(body.password, 10);
  }

  await db.usuario.update({ where: { id: BigInt(params.id) }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;
  // No te borres a ti mismo.
  if (s.userId === BigInt(params.id)) return NextResponse.json({ error: "no puedes borrarte" }, { status: 400 });
  await db.usuario.update({ where: { id: BigInt(params.id) }, data: { activo: false } });
  return NextResponse.json({ ok: true });
}
