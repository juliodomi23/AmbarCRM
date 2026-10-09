import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { conErrores } from "@/lib/errores-api";

export const dynamic = "force-dynamic";

async function manejarPATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion(true);
  if ("error" in s) return s.error;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const k of ["nombre", "descripcion", "color", "activo"]) if (k in body) data[k] = body[k];
  await db.embudo.update({ where: { id: BigInt(params.id) }, data });
  return NextResponse.json({ ok: true });
}

async function manejarDELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion(true);
  if ("error" in s) return s.error;
  await db.embudo.delete({ where: { id: BigInt(params.id) } });
  return NextResponse.json({ ok: true });
}

export const PATCH = conErrores(manejarPATCH);
export const DELETE = conErrores(manejarDELETE);
