import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { validarPuesto } from "@/lib/puestos";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Crea un integrante. Los permisos dependen de rol; puesto es solo operativo. */
export async function POST(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const { nombre, email, password, rol, puesto } = await req.json().catch(() => ({}));
  if (!nombre || !email || !password) {
    return NextResponse.json({ error: "faltan campos" }, { status: 400 });
  }
  if (String(password).length < 8) {
    return NextResponse.json({ error: "la contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }
  const puestoValidado = validarPuesto(puesto ?? "Agente");
  if ("error" in puestoValidado) {
    return NextResponse.json({ error: puestoValidado.error }, { status: 400 });
  }

  const existe = await db.usuario.findFirst({ where: { email } });
  if (existe) return NextResponse.json({ error: "el email ya existe" }, { status: 409 });

  const u = await db.usuario.create({
    data: {
      nombre,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      rol: rol === "admin" ? "admin" : "agente",
      puesto: puestoValidado.valor,
    },
  });
  return NextResponse.json({ ok: true, id: u.id.toString() });
}
