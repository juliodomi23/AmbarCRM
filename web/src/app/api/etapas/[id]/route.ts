import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion(true);
  if ("error" in s) return s.error;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const k of ["nombre", "color", "tipo", "orden"]) if (k in body) data[k] = body[k];
  await db.etapa.update({ where: { id: BigInt(params.id) }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion(true);
  if ("error" in s) return s.error;
  // Evita borrar una etapa con oportunidades dentro.
  const cuenta = await db.oportunidad.count({ where: { etapaId: BigInt(params.id) } });
  if (cuenta > 0) return NextResponse.json({ error: "la etapa tiene oportunidades" }, { status: 409 });
  await db.etapa.delete({ where: { id: BigInt(params.id) } });
  return NextResponse.json({ ok: true });
}
