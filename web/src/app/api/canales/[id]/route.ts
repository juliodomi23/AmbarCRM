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

/** Elimina la configuración de un canal. Por defecto conserva conversaciones y contactos. */
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const canalId = BigInt(params.id);
  const canal = await db.canalWhatsapp.findUnique({ where: { id: canalId } });
  if (!canal) return NextResponse.json({ error: "canal inexistente" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  let borrados: { conversaciones: number; grupos: number } | undefined;
  if (body?.borrarDatos === true) {
    const conversaciones = await db.conversacion.deleteMany({ where: { canalId } });
    const grupos = await db.grupo.deleteMany({ where: { canalId } });
    borrados = { conversaciones: conversaciones.count, grupos: grupos.count };
  }

  // Las relaciones del canal usan SET NULL: sin borrarDatos, el histórico queda conservado.
  await db.canalWhatsapp.delete({ where: { id: canalId } });
  return NextResponse.json({ ok: true, borrados });
}
