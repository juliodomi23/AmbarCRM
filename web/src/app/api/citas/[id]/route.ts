import { avisosDeCita } from "@/lib/citas-avisos";
import { NextRequest, NextResponse } from "next/server";
import { aBigInt } from "@/lib/ids";
import { conModulo, type SesionModulo } from "@/lib/con-modulo";
import { editarCita, eliminarCitaCancelada, conErroresCita } from "@/lib/citas-servidor";
import { referenciaPropia } from "@/lib/referencias";
import { errorTextoCita, fechaEntradaCita } from "@/lib/citas-reglas";
import { solicitarResena } from "@/lib/resenas-envio";

const ESTADOS = [
  "programada",
  "confirmada",
  "en_sala",
  "completada",
  "cancelada",
  "no_asistio",
] as const;

export const DELETE = conModulo("citas", {}, conErroresCita(async (s: SesionModulo, _req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const id = aBigInt((await props.params).id);
  if (!id || id > 9223372036854775807n) return NextResponse.json({ error: "Cita inexistente" }, { status: 404 });
  await eliminarCitaCancelada(s.orgId!, id);
  return NextResponse.json({ ok: true });
}));

export const PATCH = conModulo("citas", {}, conErroresCita(async (s: SesionModulo, req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object" || Array.isArray(b)) return NextResponse.json({ error: "Datos de cita inválidos" }, { status: 400 });
  const error = errorTextoCita(b);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (["contactoId", "conversacionId", "responsableId"].some((campo) => campo in b)) return NextResponse.json({ error: "Esta edición solo admite título, notas, horario, especialista y estado" }, { status: 400 });
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
  if ("notas" in b) data.notas = String(b.notas ?? "").trim() || null;
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
    if (doctorId !== null && (doctorId <= 0 || doctorId > 9223372036854775807n)) return NextResponse.json({ error: "Especialista inválido" }, { status: 400 });
    if (doctorId !== null && !(await referenciaPropia("doctor", doctorId))) return NextResponse.json({ error: "Especialista inexistente" }, { status: 400 });
    data.doctorId = doctorId;
  }
  if ("inicio" in b) data.inicio = fechaEntradaCita(b.inicio);
  if ("fin" in b) data.fin = fechaEntradaCita(b.fin);
  if ((data.inicio && Number.isNaN(+data.inicio)) || (data.fin && Number.isNaN(+data.fin))) {
    return NextResponse.json({ error: "fecha inválida" }, { status: 400 });
  }
  const citaId = aBigInt(id);
  if (!citaId || citaId > 9223372036854775807n) return NextResponse.json({ error: "Cita inexistente" }, { status: 404 });
  const { cita, completada } = await editarCita(s.orgId!, citaId, data);
  if (completada) {
    await solicitarResena(s.orgId!, { evento: "cita", citaId, contactoId: cita.contactoId });
  }
  return NextResponse.json({ ok: true, avisos: await avisosDeCita(cita) });
}));
