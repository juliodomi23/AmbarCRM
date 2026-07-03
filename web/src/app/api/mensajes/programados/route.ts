import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** Pendientes de una conversación: GET ?conversacionId=ID */
export async function GET(req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const convId = req.nextUrl.searchParams.get("conversacionId");
  if (!convId) return NextResponse.json({ error: "falta conversacionId" }, { status: 400 });

  const programados = await db.mensajeProgramado.findMany({
    where: { conversacionId: BigInt(convId), estado: "pendiente" },
    orderBy: { enviarAt: "asc" }
  });
  return NextResponse.json({ programados: serializar(programados) });
}

/** Programa un mensaje. Body: { conversacionId, texto, enviarAt (ISO) } */
export async function POST(req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const { conversacionId, texto, enviarAt } = await req.json().catch(() => ({}));
  if (!conversacionId || !texto?.trim() || !enviarAt) {
    return NextResponse.json({ error: "faltan conversacionId, texto o enviarAt" }, { status: 400 });
  }
  const fecha = new Date(enviarAt);
  if (isNaN(fecha.getTime()) || fecha.getTime() < Date.now() + 60_000) {
    return NextResponse.json({ error: "la fecha debe ser al menos 1 minuto en el futuro" }, { status: 400 });
  }

  const conv = await db.conversacion.findUnique({ where: { id: BigInt(conversacionId) }, include: { contacto: true } });
  if (!conv) return NextResponse.json({ error: "conversación inexistente" }, { status: 404 });
  if (!conv.contacto.telefono) return NextResponse.json({ error: "el contacto no tiene teléfono" }, { status: 400 });

  const p = await db.mensajeProgramado.create({
    data: {
      conversacionId: conv.id,
      contenido: texto.trim(),
      enviarAt: fecha,
      creadoPor: s.userId
    }
  });
  return NextResponse.json({ ok: true, programado: serializar(p) });
}
