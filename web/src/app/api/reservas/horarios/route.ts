import { NextRequest, NextResponse } from "next/server";
import { crearHorarioDoctor } from "@/lib/reservas/configuracion";
import { conErroresCita } from "@/lib/citas-servidor";
import { conModulo, type SesionModulo } from "@/lib/con-modulo";
import { referenciaAjena } from "@/lib/referencias";
import { validarHorarioDoctor } from "@/lib/reservas/validar";
import { serializar } from "@/lib/serialize";

/** Bloque del horario semanal. Body: { doctorId, diaSemana (0=domingo), inicio: "09:00", fin: "14:00" } */
export const POST = conModulo("reservas_en_linea", { admin: true }, conErroresCita(async (sesion: SesionModulo, req: NextRequest) => {
  const validacion = validarHorarioDoctor(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  if (await referenciaAjena(validacion.data, { doctorId: "doctor" })) {
    return NextResponse.json({ error: "especialista inexistente" }, { status: 400 });
  }
  const horario = await crearHorarioDoctor(sesion.orgId!, validacion.data);
  return NextResponse.json(serializar({ horario }), { status: 201 });
}));
