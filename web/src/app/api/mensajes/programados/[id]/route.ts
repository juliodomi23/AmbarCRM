import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Cancela un mensaje programado (solo si sigue pendiente). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const r = await db.mensajeProgramado.updateMany({
    where: { id: BigInt(params.id), estado: "pendiente" },
    data: { estado: "cancelado" }
  });
  if (r.count === 0) return NextResponse.json({ error: "no existe o ya se envió" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
