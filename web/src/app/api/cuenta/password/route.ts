import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { permitido } from "@/lib/rate-limit";
import { conErrores } from "@/lib/errores-api";

export const dynamic = "force-dynamic";

/** Cambia la contraseña de quien tiene la sesión. Body: { actual, nueva } */
async function manejarPOST(req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;
  if (!s.userId) return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  if (!permitido(`cuenta-password:${s.orgId}:${s.userId}`, 5, 15 * 60_000)) {
    return NextResponse.json({ error: "demasiados intentos, espera unos minutos" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const actual = typeof body?.actual === "string" ? body.actual : "";
  const nueva = typeof body?.nueva === "string" ? body.nueva : "";
  if (!actual || !nueva) return NextResponse.json({ error: "faltan campos (actual, nueva)" }, { status: 400 });
  if (nueva.length < 8) {
    return NextResponse.json({ error: "la contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }
  if (nueva === actual) {
    return NextResponse.json({ error: "la contraseña nueva debe ser distinta a la actual" }, { status: 400 });
  }

  const usuario = await db.usuario.findUnique({ where: { id: s.userId } });
  if (!usuario || !(await bcrypt.compare(actual, usuario.passwordHash))) {
    return NextResponse.json({ error: "la contraseña actual no es correcta" }, { status: 400 });
  }

  await db.usuario.update({ where: { id: s.userId }, data: { passwordHash: await bcrypt.hash(nueva, 10) } });
  return NextResponse.json({ ok: true });
}

export const POST = conErrores(manejarPOST);
