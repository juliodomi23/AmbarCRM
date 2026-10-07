import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireModuloActivo } from "@/lib/modulos";
import { requireSesion } from "@/lib/session";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;
  const apagado = await requireModuloActivo("citas");
  if (apagado) return apagado;
  const desde = new Date(
    req.nextUrl.searchParams.get("desde") ?? new Date().toISOString(),
  );
  const hasta = new Date(
    req.nextUrl.searchParams.get("hasta") ??
      new Date(desde.getTime() + 7 * 86400000).toISOString(),
  );
  return NextResponse.json({
    citas: await db.cita.findMany({
      where: { inicio: { gte: desde, lt: hasta } },
      include: { contacto: true, responsable: true },
      orderBy: { inicio: "asc" },
    }),
  });
}
export async function POST(req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;
  const apagado = await requireModuloActivo("citas");
  if (apagado) return apagado;
  const b = await req.json().catch(() => ({}));
  const inicio = new Date(b.inicio),
    fin = new Date(b.fin);
  if (
    !b.contactoId ||
    !b.titulo?.trim() ||
    Number.isNaN(+inicio) ||
    Number.isNaN(+fin) ||
    fin <= inicio
  )
    return NextResponse.json(
      { error: "datos de cita inválidos" },
      { status: 400 },
    );
  const cita = await db.cita.create({
    data: {
      contactoId: BigInt(b.contactoId),
      conversacionId: b.conversacionId ? BigInt(b.conversacionId) : null,
      responsableId: b.responsableId ? BigInt(b.responsableId) : s.userId,
      titulo: b.titulo.trim(),
      notas: b.notas?.trim() || null,
      inicio,
      fin,
    },
    include: { contacto: true },
  });
  return NextResponse.json({ cita });
}
