import { NextRequest, NextResponse } from "next/server";
import { validarMovimientoCaja } from "@/lib/caja";
import { ErrorCaja, movimientoCaja } from "@/lib/caja-db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";

export const POST = conModulo("caja", {}, async (sesion, req: NextRequest) => {
  if (sesion.userId === null || sesion.orgId === null) return NextResponse.json({ error: "Sesión incompleta" }, { status: 400 });
  const validacion = validarMovimientoCaja((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    const movimiento = await movimientoCaja({ ...sesion, userId: sesion.userId, orgId: sesion.orgId }, validacion.data);
    return NextResponse.json(serializar({ movimiento }), { status: 201 });
  } catch (error) {
    if (error instanceof ErrorCaja) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
});
