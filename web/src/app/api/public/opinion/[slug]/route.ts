import { NextRequest, NextResponse } from "next/server";
import { calificacionValida, origenValido } from "@/lib/resenas";
import { negocioResenas, registrarResena } from "@/lib/resenas-db";
import { errorPublico, limitarIp } from "@/lib/reservas/publico";

export const dynamic = "force-dynamic";

/** Guarda la calificación y devuelve siempre el enlace configurado; nunca una URL recibida. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const limitado = limitarIp(req, "opinion", 30, 10 * 60_000);
  if (limitado) return limitado;
  const negocio = await negocioResenas((await params).slug);
  if (!negocio) return errorPublico("Este negocio no recibe opiniones", 404);
  const body = await req.json().catch(() => ({}));
  const calificacion = calificacionValida(body.calificacion);
  if (calificacion === null) return errorPublico("Elige de 1 a 5 estrellas", 400);
  await registrarResena(negocio.orgId, calificacion, origenValido(body.origen));
  return NextResponse.json({ ok: true, url: negocio.enlaceGoogle });
}
