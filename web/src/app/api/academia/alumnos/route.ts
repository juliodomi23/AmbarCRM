import { NextRequest, NextResponse } from "next/server";
import { validarAlumno } from "@/lib/academia";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";

export const POST = conModulo("alumnos", {}, async (sesion, req: NextRequest) => {
  const validacion = validarAlumno(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const alumno = await db.alumnoAcademia.create({ data: validacion.data });
  return NextResponse.json(serializar({ alumno }), { status: 201 });
});
