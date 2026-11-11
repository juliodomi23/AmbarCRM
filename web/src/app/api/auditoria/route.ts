import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo, type SesionModulo } from "@/lib/con-modulo";
import { db, orgActual } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { aBigInt } from "@/lib/ids";
import { referenciaAjena } from "@/lib/referencias";
import { texto } from "@/lib/despacho-api";
import { LIMITE_PANEL } from "@/lib/paginacion";
import {
  esAreaAuditoria,
  esColorAuditoria,
  normalizarPeriodo,
  puedeGestionarAuditoria,
  rangoMesAuditoria,
} from "@/lib/auditoria";

function exigirGestion(sesion: SesionModulo) {
  if (!puedeGestionarAuditoria(sesion.puesto, sesion.rol)) {
    return NextResponse.json({ error: "Solo dirección o administración puede capturar auditorías" }, { status: 403 });
  }
  return null;
}

async function nombresUsuarios(ids: (bigint | null)[]) {
  const limpios = [...new Set(ids.filter((id): id is bigint => id !== null).map(String))].map(BigInt);
  if (!limpios.length) return new Map<string, string>();
  const usuarios = await db.usuario.findMany({ where: { id: { in: limpios } }, select: { id: true, nombre: true } });
  return new Map(usuarios.map((usuario) => [String(usuario.id), usuario.nombre]));
}

export const GET = conModulo("auditoria", {}, async (sesion, req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const where: Prisma.AuditoriaEvaluacionWhereInput = {};

  const area = params.get("area");
  if (area && esAreaAuditoria(area)) where.area = area;

  const color = params.get("color");
  if (color && esColorAuditoria(color)) where.color = color;

  const colaboradorId = aBigInt(params.get("colaboradorId"));
  if (colaboradorId) where.colaboradorId = colaboradorId;

  const rango = rangoMesAuditoria(params.get("periodo"));
  if (rango) where.periodo = { gte: rango.inicio, lt: rango.fin };

  if (!puedeGestionarAuditoria(sesion.puesto, sesion.rol)) {
    if (!sesion.userId) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
    where.colaboradorId = sesion.userId;
  }

  const [evaluaciones, total, resumen] = await Promise.all([
    db.auditoriaEvaluacion.findMany({
      where,
      orderBy: [{ periodo: "desc" }, { area: "asc" }, { colaboradorId: "asc" }],
      take: LIMITE_PANEL,
    }),
    db.auditoriaEvaluacion.count({ where }),
    db.auditoriaEvaluacion.groupBy({
      by: ["area", "color"],
      where,
      _count: { _all: true },
    }),
  ]);

  const nombres = await nombresUsuarios(
    evaluaciones.flatMap((evaluacion) => [evaluacion.colaboradorId, evaluacion.evaluadorId]),
  );

  return NextResponse.json(
    serializar({
      evaluaciones: evaluaciones.map((evaluacion) => ({
        ...evaluacion,
        colaboradorNombre: nombres.get(String(evaluacion.colaboradorId)) ?? null,
        evaluadorNombre: nombres.get(String(evaluacion.evaluadorId)) ?? null,
      })),
      total,
      limite: LIMITE_PANEL,
      resumen: resumen.map((fila) => ({ area: fila.area, color: fila.color, conteo: fila._count._all })),
    }),
  );
});

export const POST = conModulo("auditoria", {}, async (sesion, req: NextRequest) => {
  const sinPermiso = exigirGestion(sesion);
  if (sinPermiso) return sinPermiso;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos de la evaluación inválidos" }, { status: 400 });
  }

  const area = texto((body as Record<string, unknown>).area);
  const color = texto((body as Record<string, unknown>).color);
  const periodo = normalizarPeriodo((body as Record<string, unknown>).periodo);
  if (!esAreaAuditoria(area)) return NextResponse.json({ error: "Área inválida" }, { status: 400 });
  if (!esColorAuditoria(color)) return NextResponse.json({ error: "Color de semáforo inválido" }, { status: 400 });
  if (!periodo) return NextResponse.json({ error: "Periodo inválido; usa un mes válido" }, { status: 400 });

  const datos = body as Record<string, unknown>;
  const evaluadorCrudo = datos.evaluadorId ?? sesion.userId;
  const ajena = await referenciaAjena(
    { colaboradorId: datos.colaboradorId, evaluadorId: evaluadorCrudo },
    { colaboradorId: "usuario", evaluadorId: "usuario" },
  );
  if (ajena) {
    return NextResponse.json(
      { error: ajena === "colaboradorId" ? "El colaborador no pertenece a esta organización" : "El evaluador no pertenece a esta organización" },
      { status: 400 },
    );
  }

  const colaboradorId = aBigInt(String(datos.colaboradorId ?? ""));
  const evaluadorId = aBigInt(String(evaluadorCrudo ?? ""));
  if (!colaboradorId || !evaluadorId) {
    return NextResponse.json({ error: "Indica el colaborador y el evaluador" }, { status: 400 });
  }

  const orgId = sesion.orgId ?? (await orgActual());
  if (!orgId) return NextResponse.json({ error: "Organización no disponible" }, { status: 400 });

  const nota = texto(datos.nota).slice(0, 1000) || null;
  const unica = { orgId_colaboradorId_area_periodo: { orgId, colaboradorId, area, periodo } };
  const anterior = await db.auditoriaEvaluacion.findUnique({
    where: unica,
    select: { id: true, color: true },
  });

  const evaluacion = await db.auditoriaEvaluacion.upsert({
    where: unica,
    create: { orgId, colaboradorId, evaluadorId, area, periodo, color, nota },
    update: { evaluadorId, color, nota },
  });

  if (!anterior || anterior.color !== color) {
    await db.auditoriaEvaluacionCambio.create({
      data: {
        orgId,
        evaluacionId: evaluacion.id,
        colorAnterior: anterior?.color ?? null,
        colorNuevo: color,
        userId: sesion.userId,
        nota,
      },
    });
  }

  return NextResponse.json(serializar({ evaluacion }), { status: anterior ? 200 : 201 });
});
