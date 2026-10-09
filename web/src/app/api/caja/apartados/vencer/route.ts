import { NextResponse } from "next/server";
import { respuestaErrorCajaA2 } from "@/lib/caja-a2-api";
import { vencerApartados } from "@/lib/caja-a2-db";
import { conModulo } from "@/lib/con-modulo";

export const POST = conModulo("caja", {}, async (sesion) => {
  if (sesion.userId === null || sesion.orgId === null) return NextResponse.json({ error: "Sesión incompleta" }, { status: 400 });
  try {
    const vencidos = await vencerApartados({ ...sesion, userId: sesion.userId, orgId: sesion.orgId });
    return NextResponse.json({ vencidos });
  } catch (error) {
    return respuestaErrorCajaA2(error);
  }
});
