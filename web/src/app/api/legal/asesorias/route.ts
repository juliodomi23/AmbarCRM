import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { esPasante, validarAsesoriaLegal } from "@/lib/legal";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";
import { referenciaAjena } from "@/lib/referencias";

export const POST = conModulo("asesorias_legales", {}, async (sesion, req: NextRequest) => {
  const validacion = validarAsesoriaLegal(await req.json().catch(() => ({})));
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  const ajena = await referenciaAjena(validacion.data, { expedienteId: "expedienteLegal", contactoId: "contacto", sucursalId: "sucursalLegal", abogadoId: "usuario" });
  if (ajena) return NextResponse.json({ error: `${ajena} inexistente` }, { status: 400 });
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
