import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Crea una plantilla / respuesta rápida. Body: { nombre, contenido, categoria? } */
export async function POST(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const { nombre, contenido, categoria } = await req.json().catch(() => ({}));
  if (!nombre || !contenido) return NextResponse.json({ error: "faltan campos" }, { status: 400 });

  const p = await db.plantillaMensaje.create({ data: { nombre, contenido, categoria: categoria || null } });
  return NextResponse.json({ ok: true, id: p.id.toString() });
}
