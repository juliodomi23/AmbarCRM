import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { referenciaAjena } from "@/lib/referencias";
import { validarHorarioDoctor } from "@/lib/reservas/validar";
import { serializar } from "@/lib/serialize";

/** Bloque del horario semanal. Body: { doctorId, diaSemana (0=domingo), inicio: "09:00", fin: "14:00" } */
export const POST = conModulo("reservas_en_linea", { admin: true }, async (_sesion, req: NextRequest) => {
  const validacion = validarHorarioDoctor(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  if (await referenciaAjena(validacion.data, { doctorId: "doctor" })) {
    return NextResponse.json({ error: "especialista inexistente" }, { status: 400 });
  }
  const { doctorId, diaSemana, inicioMin, finMin } = validacion.data;
  const empalme = await db.horarioDoctor.count({
    where: { doctorId, diaSemana, inicioMin: { lt: finMin }, finMin: { gt: inicioMin } },
  });
  if (empalme) return NextResponse.json({ error: "Ese horario se empalma con otro del mismo día" }, { status: 409 });
  const horario = await db.horarioDoctor.create({ data: validacion.data });
  return NextResponse.json(serializar({ horario }), { status: 201 });
});
