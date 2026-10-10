import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { botAutorizado, conBot } from "@/lib/bot-auth";
import { aBigInt } from "@/lib/ids";
import { referenciaPropia } from "@/lib/referencias";
import { crearLeadSiNoTiene } from "@/lib/services/funnel";
import { auditarBot } from "@/lib/services/bots";
import { conErrores } from "@/lib/errores-api";

export const dynamic = "force-dynamic";

/**
 * Crea una tarea ligada a la oportunidad abierta del contacto (si no tiene, se crea el lead).
 * POST /api/v1/accounts/:accountId/conversations/:conversationId/tasks
 * Body: { titulo, descripcion?, venceAt? (ISO), responsableId? }
 */
async function manejarPOST(req: NextRequest, props: { params: Promise<{ accountId: string; conversationId: string }> }) {
  const params = await props.params;
  return conBot(req, "crear_tarea", async (bot) => {
    const convId = aBigInt(params.conversationId);
    if (convId === null) return NextResponse.json({ error: "conversationId inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const titulo = String(body.titulo ?? "").trim();
    if (!titulo || titulo.length > 200) return NextResponse.json({ error: "titulo requerido (máx. 200 caracteres)" }, { status: 400 });
    const descripcion = body.descripcion == null ? null : String(body.descripcion).slice(0, 2000);
    const venceAt = body.venceAt == null || body.venceAt === "" ? null : new Date(String(body.venceAt));
    if (venceAt && Number.isNaN(venceAt.getTime())) return NextResponse.json({ error: "venceAt inválido (usa ISO 8601)" }, { status: 400 });

    const conv = await db.conversacion.findUnique({ where: { id: convId }, include: { contacto: true } });
    if (!conv) return NextResponse.json({ error: "conversación inexistente" }, { status: 404 });
    if (!botAutorizado(bot, conv)) return NextResponse.json({ error: "el bot no opera en este canal" }, { status: 403 });

    const responsableId = await referenciaPropia("usuario", body.responsableId);
    if (responsableId === false) return NextResponse.json({ error: "responsableId inexistente" }, { status: 400 });

    const oportunidad = await crearLeadSiNoTiene(conv.contactoId, null, conv.contacto.nombre);
    if (!oportunidad) return NextResponse.json({ error: "no hay embudo configurado para ligar la tarea" }, { status: 422 });

    const tarea = await db.tarea.create({
      data: {
        oportunidadId: oportunidad.id,
        responsableId: responsableId ?? conv.responsableId ?? oportunidad.responsableId,
        titulo,
        descripcion,
        venceAt
      }
    });
    await auditarBot(bot, conv.id, "tarea_creada", {
      entidad: "tarea",
      entidadId: tarea.id,
      despues: { titulo, venceAt, responsableId: tarea.responsableId, oportunidadId: oportunidad.id }
    });

    return NextResponse.json({
      id: Number(tarea.id),
      titulo: tarea.titulo,
      descripcion: tarea.descripcion,
      vence_at: tarea.venceAt?.toISOString() ?? null,
      responsable_id: tarea.responsableId?.toString() ?? null,
      oportunidad_id: Number(oportunidad.id)
    });
  });
}

export const POST = conErrores(manejarPOST);
