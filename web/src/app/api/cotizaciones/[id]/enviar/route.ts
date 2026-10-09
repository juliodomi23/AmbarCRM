import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { respuestaErrorCotizacion } from "@/lib/cotizaciones-api";
import { enviarCotizacionWhatsapp } from "@/lib/cotizacion-envio";
import { aBigInt } from "@/lib/ids";

export const POST = conModulo("cotizaciones", {}, async (sesion, _req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const id = aBigInt((await params).id);
  if (id === null) return NextResponse.json({ error: "Cotización inválida" }, { status: 400 });
  try {
    return NextResponse.json(await enviarCotizacionWhatsapp(id, sesion.userId));
  } catch (error) {
    return respuestaErrorCotizacion(error);
  }
});
