import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Crea una tarea. Body: { titulo, descripcion?, venceAt?, responsableId?, oportunidadId? } */
export async function POST(req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const { titulo, descripcion, venceAt, responsableId, oportunidadId } = await req.json().catch(() => ({}));
  if (!titulo) return NextResponse.json({ error: "falta titulo" }, { status: 400 });

  const t = await db.tarea.create({
    data: {
      titulo,
      descripcion: descripcion || null,
      venceAt: venceAt ? new Date(venceAt) : null,
      responsableId: responsableId ? BigInt(responsableId) : s.userId,
      oportunidadId: oportunidadId ? BigInt(oportunidadId) : null
    }
  });

  if (oportunidadId) {
    await db.evento.create({
      data: { oportunidadId: BigInt(oportunidadId), tipo: "tarea", descripcion: `Tarea: ${titulo}`, usuarioId: s.userId }
    });
  }
  return NextResponse.json({ ok: true, id: t.id.toString() });
}
