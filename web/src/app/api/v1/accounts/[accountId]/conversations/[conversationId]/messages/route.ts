import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/channel";
import { requireBot, botAutorizado } from "@/lib/bot-auth";
import { aBigInt } from "@/lib/ids";

export const dynamic = "force-dynamic";

/**
 * Endpoint compatible con la API de Chatwoot para que el bot responda.
 * POST /api/v1/accounts/:accountId/conversations/:conversationId/messages
 * Header: api_access_token = token del bot
 * Body:   { content, message_type?: "outgoing", private?: boolean }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { accountId: string; conversationId: string } }
) {
  const bot = await requireBot(req);
  if (!bot) return NextResponse.json({ error: "token inválido" }, { status: 401 });

  const convId = aBigInt(params.conversationId);
  if (convId === null) return NextResponse.json({ error: "conversationId inválido" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const content: string = (body.content ?? "").toString();
  const esPrivado = body.private === true;
  if (!content.trim()) return NextResponse.json({ error: "content vacío" }, { status: 400 });

  const conv = await db.conversacion.findUnique({
    where: { id: convId },
    include: { contacto: true, canal: true }
  });
  if (!conv) return NextResponse.json({ error: "conversación inexistente" }, { status: 404 });
  if (!botAutorizado(bot, conv)) return NextResponse.json({ error: "el bot no opera en este canal" }, { status: 403 });

  // Nota privada: se guarda pero no se manda a WhatsApp (igual que en Chatwoot).
  if (esPrivado) {
    const nota = await db.mensaje.create({
      data: { conversacionId: conv.id, direccion: "saliente", tipo: "texto", contenido: content, interna: true, status: "enviado" }
    });
    return NextResponse.json({ id: Number(nota.id), content, message_type: "outgoing", private: true });
  }

  if (!conv.contacto.telefono) return NextResponse.json({ error: "el contacto no tiene teléfono" }, { status: 422 });

  const provider = getProvider(conv.canal?.proveedor ?? "evolution", conv.canal?.config, conv.canal?.instancia);
  const envio = await provider.enviarTexto(conv.contacto.telefono, content);

  const mensaje = await db.mensaje.create({
    data: {
      conversacionId: conv.id,
      direccion: "saliente",
      tipo: "texto",
      contenido: content,
      status: envio.ok ? "enviado" : "fallido",
      waMessageId: envio.waMessageId
      // enviadoPor null => lo mandó el bot
    }
  });
  await db.conversacion.update({ where: { id: conv.id }, data: { ultimoMensajeAt: new Date() } });

  if (!envio.ok) return NextResponse.json({ error: envio.error ?? "fallo al enviar" }, { status: 502 });

  // Forma de respuesta tipo Chatwoot.
  return NextResponse.json({
    id: Number(mensaje.id),
    content,
    message_type: "outgoing",
    conversation_id: Number(conv.id),
    created_at: mensaje.createdAt.toISOString()
  });
}
