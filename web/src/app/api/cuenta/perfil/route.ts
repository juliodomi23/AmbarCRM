import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { permitido } from "@/lib/rate-limit";
import { conErrores } from "@/lib/errores-api";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Edita nombre y correo de quien tiene la sesión. Cambiar el correo exige la contraseña actual. Body: { nombre?, email?, actual? } */
async function manejarPATCH(req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;
  if (!s.userId) return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "datos inválidos" }, { status: 400 });

  const usuario = await db.usuario.findUnique({ where: { id: s.userId } });
  if (!usuario) return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  const data: { nombre?: string; email?: string } = {};
  if (typeof body.nombre === "string") {
    const nombre = body.nombre.trim();
    if (!nombre || nombre.length > 80) return NextResponse.json({ error: "el nombre debe tener entre 1 y 80 caracteres" }, { status: 400 });
    data.nombre = nombre;
  }
  if (typeof body.email === "string") {
    const email = body.email.trim().toLowerCase();
    if (!EMAIL.test(email)) return NextResponse.json({ error: "correo inválido" }, { status: 400 });
    if (email !== usuario.email) {
      if (!permitido(`cuenta-perfil:${s.orgId}:${s.userId}`, 5, 15 * 60_000)) {
        return NextResponse.json({ error: "demasiados intentos, espera unos minutos" }, { status: 429 });
      }
      const actual = typeof body.actual === "string" ? body.actual : "";
      if (!actual || !(await bcrypt.compare(actual, usuario.passwordHash))) {
        return NextResponse.json({ error: "para cambiar el correo escribe tu contraseña actual" }, { status: 400 });
      }
      const ocupado = await db.usuario.findFirst({ where: { email, NOT: { id: s.userId } } });
      if (ocupado) return NextResponse.json({ error: "ese correo ya lo usa otra persona de tu organización" }, { status: 409 });
      data.email = email;
    }
  }
  if (!Object.keys(data).length) return NextResponse.json({ ok: true });

  await db.usuario.update({ where: { id: s.userId }, data });
  return NextResponse.json({ ok: true });
}

export const PATCH = conErrores(manejarPATCH);
