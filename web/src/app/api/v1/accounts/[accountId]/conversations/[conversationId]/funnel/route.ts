import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireBot, botAutorizado } from "@/lib/bot-auth";
import { aBigInt } from "@/lib/ids";
import { moverLeadAEtapa } from "@/lib/services/funnel";

export const dynamic = "force-dynamic";

/**
 * Mueve el lead del contacto a una etapa del embudo (tool `actualizar_funnel` del bot).
 * POST /api/v1/accounts/:accountId/conversations/:conversationId/funnel
 * Header: api_access_token. Body: { etapa: "Contactado" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const bot = await requireBot(req);
  if (!bot) return NextResponse.json({ error: "token inválido" }, { status: 401 });

  const convId = aBigInt(params.conversationId);
  if (convId === null) return NextResponse.json({ error: "conversationId inválido" }, { status: 400 });

  const { etapa } = await req.json().catch(() => ({}));
  if (!etapa) return NextResponse.json({ error: "falta 'etapa'" }, { status: 400 });

  const conv = await db.conversacion.findUnique({
    where: { id: convId },
    include: { contacto: true }
  });
  if (!conv) return NextResponse.json({ error: "conversación inexistente" }, { status: 404 });
  if (!botAutorizado(bot, conv)) return NextResponse.json({ error: "el bot no opera en este canal" }, { status: 403 });

  const res = await moverLeadAEtapa(conv.contactoId, String(etapa), conv.contacto.nombre);
  if (!res.ok) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}
