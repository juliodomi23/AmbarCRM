import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const { nombre, color } = await req.json().catch(() => ({}));
  if (!nombre) return NextResponse.json({ error: "falta nombre" }, { status: 400 });

  // Sin unique global por nombre: el org lo acota RLS, así que buscamos y decidimos.
  const existe = await db.etiqueta.findFirst({ where: { nombre } });
  const e = existe
    ? await db.etiqueta.update({ where: { id: existe.id }, data: { color: color || undefined } })
    : await db.etiqueta.create({ data: { nombre, color: color || "#B45309" } });
  return NextResponse.json({ ok: true, id: e.id.toString() });
}
