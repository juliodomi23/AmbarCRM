import { NextRequest, NextResponse } from "next/server";
import { validarColegiatura } from "@/lib/academia";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";

export const POST = conModulo("colegiaturas", {}, async (sesion, req: NextRequest) => {
  const validacion = validarColegiatura(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const colegiatura = await db.colegiaturaAcademia.create({ data: validacion.data });
  return NextResponse.json(serializar({ colegiatura }), { status: 201 });
});
