import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const campo of ["nombre", "telefono", "email", "empresa", "fuente", "notas"]) {
    if (campo in body) data[campo] = body[campo] || null;
  }
  if ("responsableId" in body) data.responsableId = body.responsableId ? BigInt(body.responsableId) : null;
  if (typeof body.esPersonal === "boolean") data.esPersonal = body.esPersonal;
  if (typeof body.optOutDifusion === "boolean") data.optOutDifusion = body.optOutDifusion;

  await db.contacto.update({ where: { id: BigInt(params.id) }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  await db.contacto.delete({ where: { id: BigInt(params.id) } });
  return NextResponse.json({ ok: true });
}
