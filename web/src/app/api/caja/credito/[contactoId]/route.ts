import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { validarLimiteCredito } from "@/lib/caja-a2";
import { respuestaErrorCajaA2 } from "@/lib/caja-a2-api";
import { configurarLimiteCredito, estadoCuentaCliente } from "@/lib/caja-a2-db";
import { conModulo } from "@/lib/con-modulo";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";

type Props = { params: Promise<{ contactoId: string }> };

export const GET = conModulo("caja", {}, async (sesion, _req: NextRequest, { params }: Props) => {
  const contactoId = aBigInt((await params).contactoId);
  if (contactoId === null || sesion.orgId === null) return NextResponse.json({ error: "Cliente inválido" }, { status: 400 });
  const cuenta = await estadoCuentaCliente(sesion.orgId, contactoId);
  if (!cuenta) return NextResponse.json({ error: "Cuenta de crédito no encontrada" }, { status: 404 });
  return NextResponse.json(serializar({ cuenta }));
});

export const PATCH = conModulo("caja", {}, async (sesion, req: NextRequest, { params }: Props) => {
  const contactoId = aBigInt((await params).contactoId);
  if (contactoId === null || sesion.userId === null || sesion.orgId === null) return NextResponse.json({ error: "Cliente o sesión inválidos" }, { status: 400 });
  const validacion = validarLimiteCredito((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    const cuenta = await configurarLimiteCredito(
      { ...sesion, userId: sesion.userId, orgId: sesion.orgId },
      contactoId,
      validacion.data.limiteCredito as Prisma.Decimal,
    );
    return NextResponse.json(serializar({ cuenta }));
  } catch (error) {
    return respuestaErrorCajaA2(error);
  }
});
