import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireModuloActivo } from "@/lib/modulos";
import { requireSesion } from "@/lib/session";

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("citas");
  if (apagado) return apagado;
  const body = await req.json().catch(() => ({}));
  const { id } = await props.params;
  await db.doctor.update({
    where: { id: BigInt(id) },
    data: { activo: Boolean(body.activo) },
  });
  return NextResponse.json({ ok: true });
}
