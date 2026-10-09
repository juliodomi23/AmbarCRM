import { NextRequest, NextResponse } from "next/server";
import { validarRespuestaCotizacion } from "@/lib/cotizaciones";
import { respuestaErrorCotizacion } from "@/lib/cotizaciones-api";
import { resolverOrgCotizacion, responderCotizacion } from "@/lib/cotizaciones-db";
import { limitarIp } from "@/lib/reservas/publico";
import { ipCliente } from "@/lib/rate-limit";
import { serializar } from "@/lib/serialize";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limitado = limitarIp(req, "cotizacion-responder", 20, 15 * 60_000);
  if (limitado) return limitado;
  const token = (await params).token;
  const orgId = await resolverOrgCotizacion(token);
  if (orgId === null) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  const validacion = validarRespuestaCotizacion((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    const resultado = await responderCotizacion(orgId, token, {
      ...validacion.data,
      ip: ipCliente(Object.fromEntries(req.headers.entries())),
    });
    return NextResponse.json(serializar(resultado));
  } catch (error) {
    return respuestaErrorCotizacion(error);
  }
}
