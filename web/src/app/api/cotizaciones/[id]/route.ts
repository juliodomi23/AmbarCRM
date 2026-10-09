import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { respuestaErrorCotizacion } from "@/lib/cotizaciones-api";
import { cotizacionInterna } from "@/lib/cotizaciones-db";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";

export const GET = conModulo("cotizaciones", {}, async (sesion, _req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const id = aBigInt((await params).id);
  if (id === null || sesion.orgId === null) return NextResponse.json({ error: "Cotización inválida" }, { status: 400 });
  try {
    const cotizacion = await cotizacionInterna(sesion.orgId, id);
    if (!cotizacion) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
    return NextResponse.json(serializar({ cotizacion }));
  } catch (error) {
    return respuestaErrorCotizacion(error);
  }
});
