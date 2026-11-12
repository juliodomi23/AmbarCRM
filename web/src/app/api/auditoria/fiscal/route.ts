import { NextRequest, NextResponse } from "next/server";
import { conModulo, type SesionModulo } from "@/lib/con-modulo";
import { db, orgActual } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { aBigInt } from "@/lib/ids";
import { referenciaAjena } from "@/lib/referencias";
import { texto } from "@/lib/despacho-api";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { esEstadoAuditoriaFiscal, puedeGestionarAuditoria } from "@/lib/auditoria";

function exigirGestion(sesion: SesionModulo) {
  if (!puedeGestionarAuditoria(sesion.puesto, sesion.rol)) {
    return NextResponse.json({ error: "Solo dirección o administración puede capturar auditorías fiscales" }, { status: 403 });
  }
  return null;
}

export const GET = conModulo("auditoria", {}, async (sesion, req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const where: { estado?: string; clienteId?: bigint } = {};

  const estado = params.get("estado");
  if (estado && esEstadoAuditoriaFiscal(estado)) where.estado = estado;

  const clienteId = aBigInt(params.get("clienteId"));
  if (clienteId) where.clienteId = clienteId;

  const [auditorias, total] = await Promise.all([
    db.auditoriaFiscalCliente.findMany({
      where,
      include: { cliente: { include: { contacto: { select: { nombre: true, empresa: true } } } } },
      orderBy: [{ fechaInicio: "desc" }],
      take: LIMITE_PANEL,
    }),
    db.auditoriaFiscalCliente.count({ where }),
  ]);

  const auditores = await db.usuario.findMany({
    where: { id: { in: [...new Set(auditorias.map((auditoria) => auditoria.auditorId))] } },
    select: { id: true, nombre: true },
  });
  const nombresAuditores = new Map(auditores.map((usuario) => [String(usuario.id), usuario.nombre]));

  return NextResponse.json(
    serializar({
      auditorias: auditorias.map((auditoria) => ({
        ...auditoria,
        auditorNombre: nombresAuditores.get(String(auditoria.auditorId)) ?? null,
      })),
      total,
      limite: LIMITE_PANEL,
    }),
  );
});

export const POST = conModulo("auditoria", {}, async (sesion, req: NextRequest) => {
  const sinPermiso = exigirGestion(sesion);
  if (sinPermiso) return sinPermiso;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos de la auditoría inválidos" }, { status: 400 });
  }
  const datos = body as Record<string, unknown>;

  const periodo = texto(datos.periodo).slice(0, 50);
  const alcance = texto(datos.alcance).slice(0, 500);
  const fechaInicio = texto(datos.fechaInicio);
  if (!periodo) return NextResponse.json({ error: "Indica el periodo auditado" }, { status: 400 });
  if (!alcance) return NextResponse.json({ error: "Indica el alcance de la auditoría" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio)) return NextResponse.json({ error: "Fecha de inicio inválida" }, { status: 400 });

  const auditorCrudo = datos.auditorId ?? sesion.userId;
  const ajena = await referenciaAjena(
    { clienteId: datos.clienteId, auditorId: auditorCrudo },
    { clienteId: "despachoCliente", auditorId: "usuario" },
  );
  if (ajena) {
    return NextResponse.json(
      { error: ajena === "clienteId" ? "El cliente no pertenece a esta organización" : "El auditor no pertenece a esta organización" },
      { status: 400 },
    );
  }

  const clienteId = aBigInt(String(datos.clienteId ?? ""));
  const auditorId = aBigInt(String(auditorCrudo ?? ""));
  if (!clienteId || !auditorId) return NextResponse.json({ error: "Indica el cliente y el auditor" }, { status: 400 });

  const orgId = sesion.orgId ?? (await orgActual());
  if (!orgId) return NextResponse.json({ error: "Organización no disponible" }, { status: 400 });

  const auditoria = await db.auditoriaFiscalCliente.upsert({
    where: { orgId_clienteId_periodo: { orgId, clienteId, periodo } },
    create: { orgId, clienteId, auditorId, periodo, alcance, fechaInicio, estado: "planeacion" },
    update: { auditorId, alcance },
  });

  return NextResponse.json(serializar({ auditoria }), { status: 201 });
});
