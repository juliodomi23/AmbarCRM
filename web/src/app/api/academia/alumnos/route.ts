import { NextRequest, NextResponse } from "next/server";
import { validarAlumno } from "@/lib/academia";
import { db } from "@/lib/db";
import { requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("alumnos");
  if (apagado) return apagado;
  const validacion = validarAlumno(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const alumno = await db.alumnoAcademia.create({ data: validacion.data });
  return NextResponse.json(serializar({ alumno }), { status: 201 });
}
