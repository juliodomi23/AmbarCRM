import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validarRegistroOperacion } from "@/lib/legal";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";
import { referenciaAjena } from "@/lib/referencias";

/** Checadas, actividades e incidencias del equipo; siempre a nombre de quien registra. */
export const POST = conModulo("operacion_legal", {}, async (sesion, req: NextRequest) => {
  const validacion = validarRegistroOperacion(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const ajena = await referenciaAjena(validacion.data, { sucursalId: "sucursalLegal" });
  if (ajena) return NextResponse.json({ error: `${ajena} inexistente` }, { status: 400 });
  const registro = await db.registroOperacionLegal.create({
    data: { ...validacion.data, usuarioId: sesion.userId },
  });
  return NextResponse.json(serializar({ registro }), { status: 201 });
});
