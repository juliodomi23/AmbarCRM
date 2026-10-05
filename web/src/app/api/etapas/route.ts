import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Crea una etapa al final de un embudo. Body: { embudoId, nombre, color?, tipo? } */
export async function POST(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const { embudoId, nombre, color, tipo } = await req.json().catch(() => ({}));
  if (!embudoId || !nombre) return NextResponse.json({ error: "faltan campos" }, { status: 400 });

  const ultima = await db.etapa.findFirst({ where: { embudoId: BigInt(embudoId) }, orderBy: { orden: "desc" } });
  const etapa = await db.etapa.create({
    data: {
      embudoId: BigInt(embudoId),
      nombre,
      color: color || "#94A3B8",
      tipo: tipo || "normal",
      orden: (ultima?.orden ?? -1) + 1
    }
  });
  return NextResponse.json({ ok: true, id: etapa.id.toString() });
}
