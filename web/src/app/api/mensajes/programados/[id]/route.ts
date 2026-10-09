import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { conErrores } from "@/lib/errores-api";

export const dynamic = "force-dynamic";

/** Cancela un mensaje programado (solo si sigue pendiente). */
async function manejarDELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const r = await db.mensajeProgramado.updateMany({
    where: { id: BigInt(params.id), estado: "pendiente" },
    data: { estado: "cancelado" }
  });
  if (r.count === 0) return NextResponse.json({ error: "no existe o ya se envió" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const DELETE = conErrores(manejarDELETE);
