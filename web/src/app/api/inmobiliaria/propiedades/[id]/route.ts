import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { requireModuloActivo } from "@/lib/modulos";
import { validarPropiedad } from "@/lib/propiedades";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("inmobiliaria");
  if (apagado) return apagado;
  const id = aBigInt((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "Propiedad inválida" }, { status: 400 });
  }
  const actual = await db.propiedad.findUnique({ where: { id } });
  if (!actual) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const validacion = validarPropiedad({ ...serializar(actual), ...body });
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  const propiedad = await db.propiedad.update({ where: { id }, data: validacion.data });
  return NextResponse.json(serializar({ propiedad }));
}
