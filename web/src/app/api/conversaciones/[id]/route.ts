import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { serializar } from "@/lib/serialize";
import { enviarCsat } from "@/lib/services/csat";
import { referenciaPropia } from "@/lib/referencias";
import { conErrores } from "@/lib/errores-api";
import { etiquetasDeContacto } from "@/lib/services/chat";
import { transaccionTenant } from "@/lib/retail-db";
import { actualizarConversacion } from "@/lib/services/conversacion-estado";

export const dynamic = "force-dynamic";

/** Detalle de la conversación: contacto, responsable y oportunidades del contacto. */
async function manejarGET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const conv = await db.conversacion.findUnique({
    where: { id: BigInt(params.id) },
    include: {
      contacto: {
        include: {
          oportunidades: {
            orderBy: { createdAt: "desc" },
            include: { etapa: true, embudo: true },
          },
          etiquetas: { select: { etiqueta: { select: { nombre: true } } } },
        },
      },
      responsable: true,
    },
  });
  if (!conv)
    return NextResponse.json({ error: "no encontrada" }, { status: 404 });

  return NextResponse.json({
    id: conv.id.toString(),
    estado: conv.estado,
    botActivo: conv.botActivo,
    etiquetas: etiquetasDeContacto(conv.contacto),
    responsableId: conv.responsableId?.toString() ?? null,
    contacto: {
      id: conv.contacto.id.toString(),
      nombre: conv.contacto.nombre,
      identificadorExterno: conv.contacto.identificadorExterno,
      telefono: conv.contacto.telefono,
      email: conv.contacto.email,
      empresa: conv.contacto.empresa,
      notas: conv.contacto.notas,
      campos: conv.contacto.campos,
      esPersonal: conv.contacto.esPersonal,
    },
    oportunidades: serializar(conv.contacto.oportunidades).map((o: any) => ({
      id: o.id,
      titulo: o.titulo,
      valor: o.valor,
      estado: o.estado,
      etapaId: o.etapaId,
      embudoId: o.embudoId,
      etapa: o.etapa?.nombre ?? null,
      embudo: o.embudo?.nombre ?? null,
    })),
  });
}

/** Actualiza la conversación. Body: { responsableId?, estado? } */
async function manejarPATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("responsableId" in body) {
    const responsableId = await referenciaPropia("usuario", body.responsableId);
    if (responsableId === false)
      return NextResponse.json({ error: "responsable inexistente" }, { status: 400 });
    data.responsableId = responsableId;
  }
  if (
    body.estado === "abierta" ||
    body.estado === "pendiente" ||
    body.estado === "cerrada"
  ) {
    data.estado = body.estado;
  }
  if (typeof body.botActivo === "boolean") data.botActivo = body.botActivo;
  if (typeof body.fijado === "boolean")
    data.fijadoAt = body.fijado ? new Date() : null;
  const nombresEtiquetas: string[] | null = Array.isArray(body.etiquetas)
    ? [...new Set<string>(body.etiquetas.map(String))]
    : null;
  if (nombresEtiquetas) data.etiquetas = nombresEtiquetas;
  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "nada que actualizar" }, { status: 400 });

  if (s.orgId === null) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const conv = await actualizarConversacion(s.orgId, BigInt(params.id), data);

  // Las etiquetas son del contacto (las mismas de Contactos, Difusión y el bot): se reemplaza su set.
  if (nombresEtiquetas && s.orgId !== null) {
    await transaccionTenant(s.orgId, async (tx) => {
      const etiquetas = await tx.etiqueta.findMany({
        where: { nombre: { in: nombresEtiquetas } },
        select: { id: true },
      });
      const ids = etiquetas.map((e) => e.id);
      await tx.contactoEtiqueta.deleteMany({ where: { contactoId: conv.contactoId, etiquetaId: { notIn: ids } } });
      await tx.contactoEtiqueta.createMany({
        data: ids.map((etiquetaId) => ({ contactoId: conv.contactoId, etiquetaId })),
        skipDuplicates: true,
      });
    });
  }

  // Al cerrar la conversación se dispara la encuesta de satisfacción (si está activa).
  if (data.estado === "cerrada") await enviarCsat(BigInt(params.id));

  return NextResponse.json({ ok: true });
}

/** Borra la conversación y sus mensajes (cascada en BD). El contacto se conserva. Solo admin. */
async function manejarDELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const borradas = await db.conversacion.deleteMany({
    where: { id: BigInt(params.id) },
  });
  if (borradas.count === 0)
    return NextResponse.json(
      { error: "conversación inexistente" },
      { status: 404 },
    );
  return NextResponse.json({ ok: true });
}

export const GET = conErrores(manejarGET);
export const PATCH = conErrores(manejarPATCH);
export const DELETE = conErrores(manejarDELETE);
