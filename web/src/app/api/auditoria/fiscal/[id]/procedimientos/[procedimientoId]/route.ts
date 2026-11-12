import { NextRequest, NextResponse } from "next/server";
import { conModulo, type SesionModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { aBigInt } from "@/lib/ids";
import { texto } from "@/lib/despacho-api";
import { esEstadoProcedimientoFiscal, puedeGestionarAuditoria } from "@/lib/auditoria";

function exigirGestion(sesion: SesionModulo) {
  if (!puedeGestionarAuditoria(sesion.puesto, sesion.rol)) {
    return NextResponse.json({ error: "Solo dirección o administración puede editar procedimientos" }, { status: 403 });
  }
  return null;
}

type Props = { params: Promise<{ id: string; procedimientoId: string }> };

export const PATCH = conModulo("auditoria", {}, async (sesion, req: NextRequest, { params }: Props) => {
  const sinPermiso = exigirGestion(sesion);
  if (sinPermiso) return sinPermiso;

  const { id: auditoriaId, procedimientoId } = await params;
  const auditoriaIdBig = aBigInt(auditoriaId);
  const id = aBigInt(procedimientoId);
  if (!auditoriaIdBig || !id) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const existente = await db.auditoriaFiscalProcedimiento.findUnique({ where: { id }, select: { id: true, auditoriaId: true, nombre: true, estado: true } });
  if (!existente || existente.auditoriaId !== auditoriaIdBig) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const datos = body as Record<string, unknown>;
  const data: { estado?: string; resultado?: string | null } = {};
  if (datos.estado !== undefined) {
    const estado = texto(datos.estado);
    if (!esEstadoProcedimientoFiscal(estado)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    data.estado = estado;
  }
  if (datos.resultado !== undefined) {
    data.resultado = texto(datos.resultado).slice(0, 2000) || null;
  }

  const actualizado = await db.auditoriaFiscalProcedimiento.updateMany({ where: { id, auditoriaId: auditoriaIdBig }, data });
  if (!actualizado.count) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (data.estado && data.estado !== existente.estado) {
    await db.auditoriaFiscalCambio.create({
      data: {
        auditoriaId: auditoriaIdBig,
        estadoAnterior: existente.estado,
        estadoNuevo: data.estado,
        userId: sesion.userId ?? null,
        nota: `Procedimiento "${existente.nombre}"${data.resultado ? `: ${data.resultado}` : ""}`,
      },
    });
  }

  const procedimiento = await db.auditoriaFiscalProcedimiento.findUnique({ where: { id } });
  return NextResponse.json(serializar({ procedimiento }));
});

export const DELETE = conModulo("auditoria", {}, async (sesion, _req: NextRequest, { params }: Props) => {
  const sinPermiso = exigirGestion(sesion);
  if (sinPermiso) return sinPermiso;

  const { id: auditoriaId, procedimientoId } = await params;
  const auditoriaIdBig = aBigInt(auditoriaId);
  const id = aBigInt(procedimientoId);
  if (!auditoriaIdBig || !id) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const eliminado = await db.auditoriaFiscalProcedimiento.deleteMany({ where: { id, auditoriaId: auditoriaIdBig } });
  if (!eliminado.count) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return NextResponse.json({ ok: true });
});
