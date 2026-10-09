import { NextRequest, NextResponse } from "next/server";
import { validarAbonoCredito } from "@/lib/caja-a2";
import { respuestaErrorCajaA2 } from "@/lib/caja-a2-api";
import { registrarAbonoCredito } from "@/lib/caja-a2-db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";

export const POST = conModulo("caja", {}, async (sesion, req: NextRequest) => {
  if (sesion.userId === null || sesion.orgId === null) return NextResponse.json({ error: "Sesión incompleta" }, { status: 400 });
  const validacion = validarAbonoCredito((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    const movimiento = await registrarAbonoCredito({ ...sesion, userId: sesion.userId, orgId: sesion.orgId }, validacion.data);
    return NextResponse.json(serializar({ movimiento }), { status: 201 });
  } catch (error) {
    return respuestaErrorCajaA2(error);
  }
});
