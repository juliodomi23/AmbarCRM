import { NextRequest, NextResponse } from "next/server";
import { conModulo, type SesionModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { aBigInt } from "@/lib/ids";
import { texto } from "@/lib/despacho-api";
import { esEstadoAuditoriaFiscal, puedeGestionarAuditoria } from "@/lib/auditoria";

function exigirGestion(sesion: SesionModulo) {
  if (!puedeGestionarAuditoria(sesion.puesto, sesion.rol)) {
    return NextResponse.json({ error: "Solo dirección o administración puede editar auditorías fiscales" }, { status: 403 });
  }
  return null;
}

export const PATCH = conModulo("auditoria", {}, async (sesion, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const sinPermiso = exigirGestion(sesion);
  if (sinPermiso) return sinPermiso;

  const id = aBigInt((await params).id);
  if (!id) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const datos = body as Record<string, unknown>;

  const estado = texto(datos.estado);
  if (!esEstadoAuditoriaFiscal(estado)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });

  const hallazgos = datos.hallazgos != null ? texto(datos.hallazgos).slice(0, 4000) || null : undefined;
  const fechaCierre = estado === "concluida" ? new Date().toISOString().slice(0, 10) : null;

  const existente = await db.auditoriaFiscalCliente.findUnique({ where: { id }, select: { id: true, estado: true } });
  if (!existente) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const auditoria = await db.auditoriaFiscalCliente.update({
    where: { id },
    data: { estado, ...(hallazgos !== undefined ? { hallazgos } : {}), fechaCierre },
  });

  if (existente.estado !== estado || hallazgos) {
    await db.auditoriaFiscalCambio.create({
      data: {
        auditoriaId: id,
        estadoAnterior: existente.estado,
        estadoNuevo: estado,
        userId: sesion.userId ?? null,
        nota: hallazgos || null,
      },
    });
  }

  return NextResponse.json(serializar({ auditoria }));
});
