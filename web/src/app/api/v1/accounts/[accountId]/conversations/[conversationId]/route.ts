import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireBot } from "@/lib/bot-auth";

export const dynamic = "force-dynamic";

/**
 * Estado de la conversación para que el bot relea si está
 * encendido/apagado (label bot_off) antes de responder.
 * GET /api/v1/accounts/:accountId/conversations/:conversationId  · Header: api_access_token
 */
export async function GET(req: NextRequest, props: { params: Promise<{ accountId: string; conversationId: string }> }) {
  const params = await props.params;
  const bot = await requireBot(req);
  if (!bot) return NextResponse.json({ error: "token inválido" }, { status: 401 });

  const conv = await db.conversacion.findUnique({
    where: { id: BigInt(params.conversationId) },
    include: { contacto: true }
  });
  if (!conv) return NextResponse.json({ error: "conversación inexistente" }, { status: 404 });

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
    meta: { sender }
  });
}
