import { NextRequest, NextResponse } from "next/server";
import { validarVentaCredito } from "@/lib/caja-a2";
import { respuestaErrorCajaA2 } from "@/lib/caja-a2-api";
import { registrarVentaCredito } from "@/lib/caja-a2-db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";

export const POST = conModulo("caja", {}, async (sesion, req: NextRequest) => {
  if (sesion.userId === null || sesion.orgId === null) return NextResponse.json({ error: "Sesión incompleta" }, { status: 400 });
  const validacion = validarVentaCredito((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    const resultado = await registrarVentaCredito({ ...sesion, userId: sesion.userId, orgId: sesion.orgId }, validacion.data);
    return NextResponse.json(serializar(resultado), { status: resultado.repetida ? 200 : 201 });
  } catch (error) {
    return respuestaErrorCajaA2(error);
  }
});
