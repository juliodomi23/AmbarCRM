import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { conErrores } from "@/lib/errores-api";

export const dynamic = "force-dynamic";

/** Agrega una nota a la oportunidad. Body: { contenido } */
async function manejarPOST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const { contenido } = await req.json().catch(() => ({}));
  if (!contenido?.trim()) return NextResponse.json({ error: "falta contenido" }, { status: 400 });

  const oportunidadId = BigInt(params.id);
  await db.nota.create({ data: { oportunidadId, usuarioId: s.userId, contenido } });
  await db.evento.create({ data: { oportunidadId, tipo: "nota", descripcion: "Nota agregada", usuarioId: s.userId } });

  return NextResponse.json({ ok: true });
}

export const POST = conErrores(manejarPOST);
