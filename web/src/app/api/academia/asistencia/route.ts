import { NextRequest, NextResponse } from "next/server";
import { validarAsistencia } from "@/lib/academia";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";
import { referenciaAjena } from "@/lib/referencias";

export const POST = conModulo("asistencia_academia", {}, async (sesion, req: NextRequest) => {
  const validacion = validarAsistencia(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const ajena = await referenciaAjena(validacion.data, { alumnoId: "alumno", cursoId: "curso" });
  if (ajena) return NextResponse.json({ error: `${ajena} inexistente` }, { status: 400 });
  const asistencia = await db.asistenciaAcademia.upsert({
    where: {
      alumnoId_cursoId_fecha: {
        alumnoId: validacion.data.alumnoId,
        cursoId: validacion.data.cursoId,
        fecha: validacion.data.fecha,
      },
    },
    update: { estado: validacion.data.estado, notas: validacion.data.notas },
    create: validacion.data,
  });
  return NextResponse.json(serializar({ asistencia }), { status: 201 });
});
