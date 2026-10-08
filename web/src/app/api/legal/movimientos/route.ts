import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { esPasante, validarMovimientoLegal } from "@/lib/legal";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";

export const POST = conModulo("finanzas_legales", {}, async (sesion, req: NextRequest) => {
  const validacion = validarMovimientoLegal(await req.json().catch(() => ({})));
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  if (esPasante(sesion.puesto, sesion.rol)) {
    const expedienteId = validacion.data.expedienteId;
    if (
      !expedienteId ||
      !(await db.expedienteLegal.findFirst({
        where: { id: expedienteId, responsableId: sesion.userId },
        select: { id: true },
      }))
    ) {
      return NextResponse.json({ error: "expediente no asignado" }, { status: 403 });
    }
  }
  const movimiento = await db.movimientoLegal.create({
    data: { ...validacion.data, usuarioId: sesion.userId },
  });
  return NextResponse.json(serializar({ movimiento }), { status: 201 });
});
