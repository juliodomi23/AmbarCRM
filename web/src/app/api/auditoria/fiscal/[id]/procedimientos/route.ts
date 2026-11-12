import { NextRequest, NextResponse } from "next/server";
import { conModulo, type SesionModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { aBigInt } from "@/lib/ids";
import { texto } from "@/lib/despacho-api";
import { puedeGestionarAuditoria } from "@/lib/auditoria";

function exigirGestion(sesion: SesionModulo) {
  if (!puedeGestionarAuditoria(sesion.puesto, sesion.rol)) {
    return NextResponse.json({ error: "Solo dirección o administración puede capturar procedimientos" }, { status: 403 });
  }
  return null;
}

export const POST = conModulo("auditoria", {}, async (sesion, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const sinPermiso = exigirGestion(sesion);
  if (sinPermiso) return sinPermiso;

  const auditoriaId = aBigInt((await params).id);
  if (!auditoriaId) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const existente = await db.auditoriaFiscalCliente.findUnique({ where: { id: auditoriaId }, select: { id: true } });
  if (!existente) return NextResponse.json({ error: "Auditoría no encontrada" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const nombre = texto((body as Record<string, unknown>).nombre).slice(0, 200);
  if (!nombre) return NextResponse.json({ error: "Indica el procedimiento o prueba a realizar" }, { status: 400 });

  const total = await db.auditoriaFiscalProcedimiento.count({ where: { auditoriaId } });
  const procedimiento = await db.auditoriaFiscalProcedimiento.create({
    data: { auditoriaId, nombre, orden: total },
  });

  return NextResponse.json(serializar({ procedimiento }), { status: 201 });
});
