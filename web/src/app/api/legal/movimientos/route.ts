import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { esPasante, validarMovimientoLegal } from "@/lib/legal";
import { requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("finanzas_legales");
  if (apagado) return apagado;
  const validacion = validarMovimientoLegal(await req.json().catch(() => ({})));
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  if (esPasante(sesion.puesto, sesion.rol)) {
    const expedienteId = validacion.data.expedienteId;
    if (
      !expedienteId ||
      !(await db.expedienteLegal.findFirst({
        where: { id: expedienteId, responsableId: sesion.userId },
        select: { id: true },
      }))
    ) {
      return NextResponse.json({ error: "expediente no asignado" }, { status: 403 });
    }
  }
  const movimiento = await db.movimientoLegal.create({
    data: { ...validacion.data, usuarioId: sesion.userId },
  });
  return NextResponse.json(serializar({ movimiento }), { status: 201 });
}
