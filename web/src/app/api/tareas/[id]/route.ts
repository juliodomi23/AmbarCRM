import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { conErrores } from "@/lib/errores-api";

export const dynamic = "force-dynamic";

/** Editar / completar. Body: { completada?, titulo?, descripcion?, venceAt? } */
async function manejarPATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("completada" in body) {
    data.completada = !!body.completada;
    data.completadaAt = body.completada ? new Date() : null;
  }
  if ("titulo" in body) data.titulo = body.titulo;
  if ("descripcion" in body) data.descripcion = body.descripcion || null;
  if ("venceAt" in body) data.venceAt = body.venceAt ? new Date(body.venceAt) : null;

  await db.tarea.update({ where: { id: BigInt(params.id) }, data });
  return NextResponse.json({ ok: true });
}

async function manejarDELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion();
  if ("error" in s) return s.error;
  await db.tarea.delete({ where: { id: BigInt(params.id) } });
  return NextResponse.json({ ok: true });
}

export const PATCH = conErrores(manejarPATCH);
export const DELETE = conErrores(manejarDELETE);
