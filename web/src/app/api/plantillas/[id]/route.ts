import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { conErrores } from "@/lib/errores-api";

export const dynamic = "force-dynamic";

async function manejarDELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion(true);
  if ("error" in s) return s.error;
  await db.plantillaMensaje.delete({ where: { id: BigInt(params.id) } });
  return NextResponse.json({ ok: true });
}

export const DELETE = conErrores(manejarDELETE);
