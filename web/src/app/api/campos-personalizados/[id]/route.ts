import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;
  const b = await req.json().catch(() => ({}));
  const { id } = await props.params;
  await db.campoPersonalizado.update({
    where: { id: BigInt(id) },
    data: {
      activo: typeof b.activo === "boolean" ? b.activo : undefined,
      orden: Number.isInteger(b.orden) ? b.orden : undefined,
    },
  });
  return NextResponse.json({ ok: true });
}
