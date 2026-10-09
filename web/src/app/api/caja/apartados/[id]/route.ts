import { NextRequest, NextResponse } from "next/server";
import { validarAbonoApartado, validarCancelacionApartado } from "@/lib/caja-a2";
import { respuestaErrorCajaA2 } from "@/lib/caja-a2-api";
import { abonarApartado, cancelarApartado } from "@/lib/caja-a2-db";
import { conModulo } from "@/lib/con-modulo";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";

export const PATCH = conModulo("caja", {}, async (sesion, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const apartadoId = aBigInt((await params).id);
  if (apartadoId === null || sesion.userId === null || sesion.orgId === null) return NextResponse.json({ error: "Apartado o sesión inválidos" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const actor = { ...sesion, userId: sesion.userId, orgId: sesion.orgId };
  try {
    if (body.accion === "abonar") {
      const validacion = validarAbonoApartado(body);
      if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
      return NextResponse.json(serializar({ apartado: await abonarApartado(actor, apartadoId, validacion.data) }));
    }
    if (body.accion === "cancelar") {
      const validacion = validarCancelacionApartado(body);
      if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
      return NextResponse.json(serializar({ apartado: await cancelarApartado(actor, apartadoId, validacion.data.forma) }));
    }
    return NextResponse.json({ error: "La acción no es válida" }, { status: 400 });
  } catch (error) {
    return respuestaErrorCajaA2(error);
  }
});
