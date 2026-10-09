import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { validarCierreTurno } from "@/lib/caja";
import { cerrarTurnoCaja, corteX, ErrorCaja } from "@/lib/caja-db";
import { conModulo } from "@/lib/con-modulo";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";

type Props = { params: Promise<{ id: string }> };

export const GET = conModulo("caja", {}, async (sesion, _req: NextRequest, { params }: Props) => {
  const turnoId = aBigInt((await params).id);
  if (turnoId === null || sesion.orgId === null) return NextResponse.json({ error: "Turno inválido" }, { status: 400 });
  try {
    return NextResponse.json(serializar({ corte: await corteX(sesion.orgId, turnoId) }));
  } catch (error) {
    if (error instanceof ErrorCaja) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
});
export const POST = conModulo("caja", {}, async (sesion, req: NextRequest, { params }: Props) => {
  const turnoId = aBigInt((await params).id);
  if (turnoId === null || sesion.userId === null || sesion.orgId === null) {
    return NextResponse.json({ error: "Turno o sesión inválidos" }, { status: 400 });
  }
  const validacion = validarCierreTurno((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    const corte = await cerrarTurnoCaja(
      { ...sesion, userId: sesion.userId, orgId: sesion.orgId },
      turnoId,
      validacion.data.efectivoContado as Prisma.Decimal,
    );
    return NextResponse.json(serializar({ corte }));
  } catch (error) {
    if (error instanceof ErrorCaja) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
});
