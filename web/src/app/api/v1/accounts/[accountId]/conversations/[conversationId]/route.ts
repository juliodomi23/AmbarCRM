import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { botAutorizado, conBot } from "@/lib/bot-auth";
import { aBigInt } from "@/lib/ids";
import { conversacionInclude, serializarConversacion } from "@/lib/bot-conversations-read";

export const dynamic = "force-dynamic";

/**
 * Estado de la conversación para que el bot relea si está encendido/apagado
 * (label bot_off) antes de responder, más sus últimos mensajes y el perfil del contacto.
 * GET /api/v1/accounts/:accountId/conversations/:conversationId  · Header: api_access_token
 */
export async function GET(req: NextRequest, props: { params: Promise<{ accountId: string; conversationId: string }> }) {
  const params = await props.params;
  return conBot(req, "leer_perfil", async (bot) => {
    const convId = aBigInt(params.conversationId);
    if (convId === null) return NextResponse.json({ error: "conversationId inválido" }, { status: 400 });

    const conv = await db.conversacion.findUnique({
      where: { id: convId },
      include: conversacionInclude
    });
    if (!conv) return NextResponse.json({ error: "conversación inexistente" }, { status: 404 });
    if (!botAutorizado(bot, conv)) return NextResponse.json({ error: "el bot no opera en este canal" }, { status: 403 });

    // Las notas internas no se incluyen: el bot podría citarlas al cliente.
    const recientes = await db.mensaje.findMany({
      where: { conversacionId: conv.id, interna: false },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: 20,
      include: { usuario: { select: { id: true, nombre: true } } }
    });
    const [ultimo, oportunidad] = await Promise.all([
      db.mensaje.findFirst({ where: { conversacionId: conv.id, interna: false }, orderBy: [{ timestamp: "desc" }, { id: "desc" }], include: { usuario: { select: { id: true, nombre: true } } } }),
      db.oportunidad.findFirst({ where: { contactoId: conv.contactoId, estado: "abierto" }, orderBy: { createdAt: "desc" }, include: { etapa: { select: { nombre: true } } } })
    ]);
    return NextResponse.json(serializarConversacion(conv, recientes.reverse(), oportunidad, ultimo));
  });
}
