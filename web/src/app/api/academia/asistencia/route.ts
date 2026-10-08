import { NextRequest, NextResponse } from "next/server";
import { validarAsistencia } from "@/lib/academia";
import { db } from "@/lib/db";
import { requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("asistencia_academia");
  if (apagado) return apagado;
  const validacion = validarAsistencia(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
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
}
