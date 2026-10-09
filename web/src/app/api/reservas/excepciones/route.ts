import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { referenciaAjena } from "@/lib/referencias";
import { validarExcepcion } from "@/lib/reservas/validar";
import { serializar } from "@/lib/serialize";

/** Día cerrado o con horario especial. Body: { doctorId, fecha, inicio?, fin?, motivo? } */
export const POST = conModulo("reservas_en_linea", { admin: true }, async (_sesion, req: NextRequest) => {
  const validacion = validarExcepcion(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  if (await referenciaAjena(validacion.data, { doctorId: "doctor" })) {
    return NextResponse.json({ error: "especialista inexistente" }, { status: 400 });
  }
  const excepcion = await db.excepcionHorario.create({ data: validacion.data });
  return NextResponse.json(serializar({ excepcion }), { status: 201 });
});
