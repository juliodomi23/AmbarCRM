import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { esPasante, validarRegistroLegal } from "@/lib/legal";
import { requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("legal");
  if (apagado) return apagado;
  const expedienteId = aBigInt((await params).id);
  if (expedienteId === null) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  if (
    esPasante(sesion.puesto, sesion.rol) &&
    !(await db.expedienteLegal.findFirst({
      where: { id: expedienteId, responsableId: sesion.userId },
      select: { id: true },
    }))
  ) {
    return NextResponse.json({ error: "expediente no asignado" }, { status: 403 });
  }
  const validacion = validarRegistroLegal(await req.json().catch(() => ({})));
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  const registro = await db.registroExpedienteLegal.create({
    data: { ...validacion.data, expedienteId, usuarioId: sesion.userId },
  });
  return NextResponse.json(serializar({ registro }), { status: 201 });
}
