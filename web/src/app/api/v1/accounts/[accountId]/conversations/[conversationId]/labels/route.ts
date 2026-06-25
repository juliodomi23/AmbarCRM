import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireBot, botAutorizado } from "@/lib/bot-auth";
import { aBigInt } from "@/lib/ids";

export const dynamic = "force-dynamic";

const ETIQUETAS_HANDOFF = ["escalado_humano", "bot_off"];

/**
 * Compatible con Chatwoot: el bot fija las etiquetas de la conversación.
 * Lo usamos para el handoff: si manda `escalado_humano`/`bot_off`, apagamos el bot y
 * dejamos la conversación pendiente para que la tome un humano.
 * POST /api/v1/accounts/:accountId/conversations/:conversationId/labels
 * Body: { labels: string[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const bot = await requireBot(req);
  if (!bot) return NextResponse.json({ error: "token inválido" }, { status: 401 });

  const convId = aBigInt(params.conversationId);
  if (convId === null) return NextResponse.json({ error: "conversationId inválido" }, { status: 400 });

  const conv = await db.conversacion.findUnique({ where: { id: convId }, select: { canalId: true } });
  if (!conv) return NextResponse.json({ error: "conversación inexistente" }, { status: 404 });
  if (!botAutorizado(bot, conv)) return NextResponse.json({ error: "el bot no opera en este canal" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const labels: string[] = Array.isArray(body.labels) ? body.labels.map(String) : [];
  const handoff = labels.some((l) => ETIQUETAS_HANDOFF.includes(l));

  await db.conversacion.update({
    where: { id: convId },
    data: handoff ? { botActivo: false, estado: "pendiente" } : { botActivo: true }
  });

  return NextResponse.json({ payload: labels });
}
