import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Crea un usuario. Body: { nombre, email, password, rol } */
export async function POST(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const { nombre, email, password, rol } = await req.json().catch(() => ({}));
  if (!nombre || !email || !password) return NextResponse.json({ error: "faltan campos" }, { status: 400 });

  const existe = await db.usuario.findFirst({ where: { email } });
  if (existe) return NextResponse.json({ error: "el email ya existe" }, { status: 409 });

  const u = await db.usuario.create({
    data: { nombre, email, passwordHash: await bcrypt.hash(password, 10), rol: rol === "admin" ? "admin" : "agente" }
  });
  return NextResponse.json({ ok: true, id: u.id.toString() });
}
