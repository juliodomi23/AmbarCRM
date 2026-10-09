import { NextRequest, NextResponse } from "next/server";
import { respuestaErrorCajaA2 } from "@/lib/caja-a2-api";
import { conModulo } from "@/lib/con-modulo";
import { enviarRecordatorioSaldo } from "@/lib/credito-recordatorio";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";

export const POST = conModulo("caja", {}, async (sesion, _req: NextRequest, { params }: { params: Promise<{ contactoId: string }> }) => {
  const contactoId = aBigInt((await params).contactoId);
  if (contactoId === null) return NextResponse.json({ error: "Cliente inválido" }, { status: 400 });
  try {
    return NextResponse.json(serializar(await enviarRecordatorioSaldo(contactoId, sesion.userId)));
  } catch (error) {
    return respuestaErrorCajaA2(error);
  }
});
