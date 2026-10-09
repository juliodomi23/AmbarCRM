import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { validarCotizacion } from "@/lib/cotizaciones";
import { respuestaErrorCotizacion } from "@/lib/cotizaciones-api";
import { crearCotizacion } from "@/lib/cotizaciones-db";
import { db } from "@/lib/db";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { serializar } from "@/lib/serialize";

export const GET = conModulo("cotizaciones", {}, async () => {
  const cotizaciones = await db.cotizacion.findMany({
    include: { contacto: true, oportunidad: true, venta: true, partidas: true },
    orderBy: { createdAt: "desc" },
    take: LIMITE_PANEL,
  });
  return NextResponse.json(serializar({ cotizaciones }));
});

export const POST = conModulo("cotizaciones", {}, async (sesion, req: NextRequest) => {
  if (sesion.orgId === null) return NextResponse.json({ error: "Organización no disponible" }, { status: 400 });
  const validacion = validarCotizacion((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    const cotizacion = await crearCotizacion(sesion.orgId, sesion.userId, validacion.data);
    return NextResponse.json(serializar({ cotizacion }), { status: 201 });
  } catch (error) {
    return respuestaErrorCotizacion(error);
  }
});
