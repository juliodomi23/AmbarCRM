import { NextRequest, NextResponse } from "next/server";
import { validarInscripcion } from "@/lib/academia";
import { db } from "@/lib/db";
import { requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("inscripciones_academia");
  if (apagado) return apagado;
  const validacion = validarInscripcion(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const curso = await db.cursoAcademia.findUnique({
    where: { id: validacion.data.cursoId }, include: { inscripciones: true },
  });
  if (!curso) return NextResponse.json({ error: "Curso no encontrado" }, { status: 404 });
  const activos = curso.inscripciones.filter((item) => item.estado === "activa").length;
  if (activos >= curso.capacidad) return NextResponse.json({ error: "El curso está lleno" }, { status: 409 });
  const inscripcion = await db.inscripcionAcademia.create({ data: validacion.data });
  return NextResponse.json(serializar({ inscripcion }), { status: 201 });
}
