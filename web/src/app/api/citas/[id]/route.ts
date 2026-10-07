import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireModuloActivo } from "@/lib/modulos";
import { requireSesion } from "@/lib/session";
export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const s = await requireSesion();
  if ("error" in s) return s.error;
  const apagado = await requireModuloActivo("citas");
  if (apagado) return apagado;
  const b = await req.json().catch(() => ({}));
  const { id } = await props.params;
  const data: any = {};
  for (const k of ["titulo", "notas", "estado"]) if (k in b) data[k] = b[k];
  for (const k of ["inicio", "fin"]) if (b[k]) data[k] = new Date(b[k]);
  if (data.inicio && data.fin && data.fin <= data.inicio)
    return NextResponse.json(
      { error: "el fin debe ser posterior al inicio" },
      { status: 400 },
    );
  await db.cita.update({ where: { id: BigInt(id) }, data });
  return NextResponse.json({ ok: true });
}
