import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { serializar } from "@/lib/serialize";
import { enviarCsat } from "@/lib/services/csat";

export const dynamic = "force-dynamic";

/** Detalle de la conversación: contacto, responsable y oportunidades del contacto. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const conv = await db.conversacion.findUnique({
    where: { id: BigInt(params.id) },
    include: {
      contacto: {
        include: {
          oportunidades: {
            orderBy: { createdAt: "desc" },
            include: { etapa: true, embudo: true }
          }
        }
      },
      responsable: true
    }
  });
  if (!conv) return NextResponse.json({ error: "no encontrada" }, { status: 404 });

  return NextResponse.json({
    id: conv.id.toString(),
    estado: conv.estado,
    botActivo: conv.botActivo,
    etiquetas: conv.etiquetas,
    responsableId: conv.responsableId?.toString() ?? null,
    contacto: {
      id: conv.contacto.id.toString(),
      nombre: conv.contacto.nombre,
      telefono: conv.contacto.telefono,
      email: conv.contacto.email,
      empresa: conv.contacto.empresa,
      notas: conv.contacto.notas,
      esPersonal: conv.contacto.esPersonal
    },
    oportunidades: serializar(conv.contacto.oportunidades).map((o: any) => ({
      id: o.id,
      titulo: o.titulo,
      valor: o.valor,
      estado: o.estado,
      etapaId: o.etapaId,
      embudoId: o.embudoId,
      etapa: o.etapa?.nombre ?? null,
      embudo: o.embudo?.nombre ?? null
    }))
  });
}

/** Actualiza la conversación. Body: { responsableId?, estado? } */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("responsableId" in body) data.responsableId = body.responsableId ? BigInt(body.responsableId) : null;
  if (body.estado === "abierta" || body.estado === "pendiente" || body.estado === "cerrada") {
    data.estado = body.estado;
  }
  if (typeof body.botActivo === "boolean") data.botActivo = body.botActivo;
  if (typeof body.fijado === "boolean") data.fijadoAt = body.fijado ? new Date() : null;
  if (Array.isArray(body.etiquetas)) data.etiquetas = body.etiquetas.map(String);
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "nada que actualizar" }, { status: 400 });

  await db.conversacion.update({ where: { id: BigInt(params.id) }, data });

  // Al cerrar la conversación se dispara la encuesta de satisfacción (si está activa).
  if (data.estado === "cerrada") await enviarCsat(BigInt(params.id));

  return NextResponse.json({ ok: true });
}
