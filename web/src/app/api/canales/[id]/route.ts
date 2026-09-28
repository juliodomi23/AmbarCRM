import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Edita un canal de WhatsApp. Body: { nombre?, proveedor?, telefono?, instancia?, estado?, config? } */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const k of ["nombre", "proveedor", "telefono", "instancia", "estado", "config", "activo"]) {
    if (k in body) data[k] = body[k];
  }
  await db.canalWhatsapp.update({ where: { id: BigInt(params.id) }, data });
  return NextResponse.json({ ok: true });
}
