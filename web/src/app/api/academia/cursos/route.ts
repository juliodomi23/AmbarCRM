import { NextRequest, NextResponse } from "next/server";
import { validarCurso } from "@/lib/academia";
import { db } from "@/lib/db";
import { requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("cursos_academia");
  if (apagado) return apagado;
  const validacion = validarCurso(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const curso = await db.cursoAcademia.create({ data: validacion.data });
  return NextResponse.json(serializar({ curso }), { status: 201 });
}
