import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { conModulo } from "@/lib/con-modulo";

const ESTADOS = [
  "programada",
  "confirmada",
  "en_sala",
  "completada",
  "cancelada",
  "no_asistio",
] as const;

export const PATCH = conModulo("citas", {}, async (s, req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const b = await req.json().catch(() => ({}));
  const { id } = await props.params;
  const data: {
    titulo?: string;
    notas?: string | null;
    estado?: (typeof ESTADOS)[number];
    inicio?: Date;
    fin?: Date;
    doctorId?: bigint | null;
  } = {};
  if ("titulo" in b) data.titulo = String(b.titulo).trim();
  if ("notas" in b) data.notas = String(b.notas).trim() || null;
  if ("estado" in b) {
    if (!ESTADOS.includes(b.estado)) {
      return NextResponse.json({ error: "estado inválido" }, { status: 400 });
    }
    data.estado = b.estado;
  }
  if ("doctorId" in b) {
    const doctorId = b.doctorId ? aBigInt(String(b.doctorId)) : null;
    if (b.doctorId && doctorId === null) {
      return NextResponse.json({ error: "doctor inválido" }, { status: 400 });
    }
    if (doctorId) {
      const doctor = await db.doctor.findFirst({ where: { id: doctorId, activo: true } });
      if (!doctor) {
        return NextResponse.json(
          { error: "doctor inexistente o inactivo" },
          { status: 400 },
        );
      }
    }
    data.doctorId = doctorId;
  }
  if (b.inicio) data.inicio = new Date(b.inicio);
  if (b.fin) data.fin = new Date(b.fin);
  if ((data.inicio && Number.isNaN(+data.inicio)) || (data.fin && Number.isNaN(+data.fin))) {
    return NextResponse.json({ error: "fecha inválida" }, { status: 400 });
  }
  const citaId = aBigInt(id);
  const actual = citaId
    ? await db.cita.findFirst({ where: { id: citaId }, select: { inicio: true, fin: true } })
    : null;
  if (!citaId || !actual) {
    return NextResponse.json({ error: "cita inexistente" }, { status: 404 });
  }
  if ((data.fin ?? actual.fin) <= (data.inicio ?? actual.inicio))
    return NextResponse.json(
      { error: "el fin debe ser posterior al inicio" },
      { status: 400 },
    );
  await db.cita.update({ where: { id: citaId }, data });
  return NextResponse.json({ ok: true });
});
