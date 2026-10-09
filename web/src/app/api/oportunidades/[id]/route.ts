import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { validarCampos } from "@/lib/campos-personalizados";
import { referenciaPropia } from "@/lib/referencias";
import { conErrores } from "@/lib/errores-api";

export const dynamic = "force-dynamic";

/** Editar oportunidad. Body: { titulo?, valor?, etapaId?, responsableId?, fechaCierreEstimada?, motivoPerdida? } */
async function manejarPATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("titulo" in body) data.titulo = body.titulo;
  if ("valor" in body) data.valor = Number(body.valor) || 0;
  if ("motivoPerdida" in body) data.motivoPerdida = body.motivoPerdida || null;
  if ("campos" in body) {
    const defs = await db.campoPersonalizado.findMany({
      where: { entidad: "oportunidad" },
    });
    const resultado = validarCampos(defs as any, body.campos);
    if (resultado.errores.length)
      return NextResponse.json(
        { error: resultado.errores.join(", ") },
        { status: 400 },
      );
    data.campos = resultado.campos;
  }
  if ("responsableId" in body) {
    const responsableId = await referenciaPropia("usuario", body.responsableId);
    if (responsableId === false)
      return NextResponse.json({ error: "responsable inexistente" }, { status: 400 });
    data.responsableId = responsableId;
  }
  if ("fechaCierreEstimada" in body)
    data.fechaCierreEstimada = body.fechaCierreEstimada
      ? new Date(body.fechaCierreEstimada)
      : null;

  // Cambiar de etapa: ajusta estado/cierre según el tipo de etapa y deja registro en el timeline.
  if ("etapaId" in body && body.etapaId) {
    const etapa = await db.etapa.findUnique({
      where: { id: BigInt(body.etapaId) },
    });
    if (!etapa)
      return NextResponse.json({ error: "etapa inexistente" }, { status: 404 });
    data.etapaId = etapa.id;
    data.embudoId = etapa.embudoId;
    data.estado =
      etapa.tipo === "ganado"
        ? "ganado"
        : etapa.tipo === "perdido"
          ? "perdido"
          : "abierto";
    data.closedAt = etapa.tipo === "normal" ? null : new Date();
    await db.evento.create({
      data: {
        oportunidadId: BigInt(params.id),
        tipo:
          etapa.tipo === "ganado"
            ? "ganada"
            : etapa.tipo === "perdido"
              ? "perdida"
              : "etapa_cambio",
        descripcion: `Movida a "${etapa.nombre}"`,
        usuarioId: s.userId,
      },
    });
  }

  await db.oportunidad.update({ where: { id: BigInt(params.id) }, data });
  return NextResponse.json({ ok: true });
}

async function manejarDELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const s = await requireSesion();
  if ("error" in s) return s.error;
  await db.oportunidad.delete({ where: { id: BigInt(params.id) } });
  return NextResponse.json({ ok: true });
}

export const PATCH = conErrores(manejarPATCH);
export const DELETE = conErrores(manejarDELETE);
