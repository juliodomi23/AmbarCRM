import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { esPasante, validarAsesoriaLegal } from "@/lib/legal";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";

export const POST = conModulo("asesorias_legales", {}, async (sesion, req: NextRequest) => {
  const validacion = validarAsesoriaLegal(await req.json().catch(() => ({})));
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  const asesoria = await db.asesoriaLegal.create({
    data: {
      ...validacion.data,
      ...(esPasante(sesion.puesto, sesion.rol)
        ? { abogadoId: sesion.userId }
        : {}),
    },
  });
  return NextResponse.json(serializar({ asesoria }), { status: 201 });
});
