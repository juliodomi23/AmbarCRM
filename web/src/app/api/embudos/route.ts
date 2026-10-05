import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Crea un embudo con etapas por defecto. Body: { nombre, descripcion? } */
export async function POST(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const { nombre, descripcion } = await req.json().catch(() => ({}));
  if (!nombre) return NextResponse.json({ error: "falta nombre" }, { status: 400 });

  const ultimo = await db.embudo.findFirst({ orderBy: { orden: "desc" } });
  const embudo = await db.embudo.create({
    data: {
      nombre,
      descripcion: descripcion || null,
      orden: (ultimo?.orden ?? -1) + 1,
      etapas: {
        create: [
          { nombre: "Nuevo lead", color: "#94A3B8", orden: 0, tipo: "normal" },
          { nombre: "Contactado", color: "#3B82F6", orden: 1, tipo: "normal" },
          { nombre: "Ganado", color: "#16A34A", orden: 2, tipo: "ganado" },
          { nombre: "Perdido", color: "#DC2626", orden: 3, tipo: "perdido" }
        ]
      }
    }
  });
  return NextResponse.json({ ok: true, id: embudo.id.toString() });
}
