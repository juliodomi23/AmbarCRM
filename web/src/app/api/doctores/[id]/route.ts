import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { conModulo } from "@/lib/con-modulo";

export const PATCH = conModulo(
  "citas",
  { admin: true },
  async (sesion, req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Datos de especialista inválidos" }, { status: 400 });
  const { id } = await props.params;
  const doctorId = aBigInt(id);
  if (!doctorId || doctorId > 9223372036854775807n || !(await db.doctor.findFirst({ where: { id: doctorId } }))) return NextResponse.json({ error: "Especialista inexistente" }, { status: 404 });
  if (typeof body.activo !== "boolean") return NextResponse.json({ error: "Indica si el especialista está activo" }, { status: 400 });
  await db.doctor.update({ where: { id: doctorId }, data: { activo: body.activo } });
  const futuras = body.activo ? 0 : await db.cita.count({ where: { doctorId, inicio: { gt: new Date() }, estado: { in: ["programada", "confirmada", "en_sala"] } } });
  return NextResponse.json({ ok: true, aviso: futuras ? `El especialista conserva ${futuras} citas futuras. Reasígnalas desde la agenda.` : null });
  },
);
