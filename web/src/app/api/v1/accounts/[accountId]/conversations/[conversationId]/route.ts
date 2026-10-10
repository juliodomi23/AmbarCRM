import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { botAutorizado, conBot } from "@/lib/bot-auth";
import { aBigInt } from "@/lib/ids";
import { oportunidadAbierta } from "@/lib/services/funnel";

export const dynamic = "force-dynamic";

/**
 * Estado de la conversación para que el bot relea si está encendido/apagado
 * (label bot_off) antes de responder, más sus últimos mensajes y el perfil del contacto.
 * GET /api/v1/accounts/:accountId/conversations/:conversationId  · Header: api_access_token
 */
export async function GET(req: NextRequest, props: { params: Promise<{ accountId: string; conversationId: string }> }) {
  const params = await props.params;
  return conBot(req, async (bot) => {
    const convId = aBigInt(params.conversationId);
    if (convId === null) return NextResponse.json({ error: "conversationId inválido" }, { status: 400 });

    const conv = await db.conversacion.findUnique({
      where: { id: convId },
      include: {
        contacto: { include: { etiquetas: { include: { etiqueta: true } } } },
        responsable: { select: { id: true, nombre: true } }
      }
    });
    if (!conv) return NextResponse.json({ error: "conversación inexistente" }, { status: 404 });
    if (!botAutorizado(bot, conv)) return NextResponse.json({ error: "el bot no opera en este canal" }, { status: 403 });

    // Las notas internas no se incluyen: el bot podría citarlas al cliente.
    const recientes = await db.mensaje.findMany({
      where: { conversacionId: conv.id, interna: false },
      orderBy: { timestamp: "desc" },
      take: 20
    });
    const oportunidad = await oportunidadAbierta(conv.contactoId);
    const etapa = oportunidad ? await db.etapa.findUnique({ where: { id: oportunidad.etapaId } }) : null;

    const sender = {
      identifier: conv.contacto.telefono,
      name: conv.contacto.nombre,
      phone_number: conv.contacto.telefono ? `+${conv.contacto.telefono}` : null
    };
    return NextResponse.json({
      id: Number(conv.id),
      status: conv.estado === "cerrada" ? "resolved" : conv.estado === "pendiente" ? "pending" : "open",
      bot_activo: conv.botActivo,
      labels: conv.botActivo ? [] : ["bot_off"],
      can_reply: true,
      meta: { sender },
      // Campos nuevos (solo se agregan; los de arriba no cambian).
      mensajes: recientes.reverse().map((m) => ({
        id: Number(m.id),
        message_type: m.direccion === "entrante" ? "incoming" : "outgoing",
        sender: m.direccion === "entrante" ? "contact" : m.enviadoPor == null ? "bot" : "agent",
        tipo: m.tipo,
        content: m.contenido ?? "",
        created_at: m.timestamp.toISOString()
      })),
      perfil: {
        etiquetas: conv.contacto.etiquetas.map((e) => e.etiqueta.nombre),
        campos: conv.contacto.campos,
        responsable: conv.responsable ? { id: Number(conv.responsable.id), nombre: conv.responsable.nombre } : null,
        oportunidad: oportunidad
          ? {
              id: Number(oportunidad.id),
              titulo: oportunidad.titulo,
              etapa: etapa?.nombre ?? null,
              valor: Number(oportunidad.valor),
              moneda: oportunidad.moneda
            }
          : null
      }
    });
  });
}
