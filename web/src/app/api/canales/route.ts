import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Crea un canal oficial YCloud dentro de la organización actual. */
export async function POST(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const body = await req.json().catch(() => ({}));
  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  const telefono = typeof body.telefono === "string" ? body.telefono.trim() : "";
  if (!nombre) return NextResponse.json({ error: "el nombre del canal es obligatorio" }, { status: 400 });

  const canal = await db.canalWhatsapp.create({
    data: { nombre, telefono: telefono || null, proveedor: "ycloud", estado: "desconectado", config: {} }
  });
  return NextResponse.json({ ok: true, canalId: Number(canal.id) }, { status: 201 });
}
