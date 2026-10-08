import { NextRequest, NextResponse } from "next/server";
import { validarCurso } from "@/lib/academia";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";

export const POST = conModulo("cursos_academia", {}, async (sesion, req: NextRequest) => {
  const validacion = validarCurso(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const curso = await db.cursoAcademia.create({ data: validacion.data });
  return NextResponse.json(serializar({ curso }), { status: 201 });
});
