import { NextRequest, NextResponse } from "next/server";
import { validarVentaCaja } from "@/lib/caja";
import { ErrorCaja, registrarVentaCaja } from "@/lib/caja-db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";

export const POST = conModulo("caja", {}, async (sesion, req: NextRequest) => {
  if (sesion.userId === null || sesion.orgId === null) return NextResponse.json({ error: "Sesión incompleta" }, { status: 400 });
  const validacion = validarVentaCaja((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    const resultado = await registrarVentaCaja(
      { ...sesion, userId: sesion.userId, orgId: sesion.orgId },
      validacion.data,
    );
    return NextResponse.json(serializar(resultado), { status: resultado.repetida ? 200 : 201 });
  } catch (error) {
    if (error instanceof ErrorCaja) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
});
