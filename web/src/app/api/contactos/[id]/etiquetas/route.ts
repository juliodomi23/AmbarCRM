import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Asigna una etiqueta al contacto. Body: { etiquetaId } */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const { etiquetaId } = await req.json().catch(() => ({}));
  if (!etiquetaId) return NextResponse.json({ error: "falta etiquetaId" }, { status: 400 });

  await db.contactoEtiqueta.upsert({
    where: { contactoId_etiquetaId: { contactoId: BigInt(params.id), etiquetaId: BigInt(etiquetaId) } },
    update: {},
    create: { contactoId: BigInt(params.id), etiquetaId: BigInt(etiquetaId) }
  });
  return NextResponse.json({ ok: true });
}

/** Quita una etiqueta. Body: { etiquetaId } */
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const { etiquetaId } = await req.json().catch(() => ({}));
  if (!etiquetaId) return NextResponse.json({ error: "falta etiquetaId" }, { status: 400 });

  await db.contactoEtiqueta.delete({
    where: { contactoId_etiquetaId: { contactoId: BigInt(params.id), etiquetaId: BigInt(etiquetaId) } }
  });
  return NextResponse.json({ ok: true });
}
