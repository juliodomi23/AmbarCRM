import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { validarExpedienteLegal } from "@/lib/legal";
import { requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("legal");
  if (apagado) return apagado;
  const id = aBigInt((await params).id);
  if (id === null) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const actual = await db.expedienteLegal.findUnique({ where: { id } });
  if (!actual) return NextResponse.json({ error: "expediente no encontrado" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const validacion = validarExpedienteLegal({ ...actual, ...body });
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  const expediente = await db.expedienteLegal.update({ where: { id }, data: validacion.data });
  return NextResponse.json(serializar({ expediente }));
}
