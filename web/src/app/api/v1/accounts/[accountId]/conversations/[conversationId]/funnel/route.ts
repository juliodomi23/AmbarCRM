import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { botAutorizado, conBot } from "@/lib/bot-auth";
import { aBigInt } from "@/lib/ids";
import { moverLeadAEtapa, oportunidadAbierta } from "@/lib/services/funnel";
import { auditarBot } from "@/lib/services/bots";

export const dynamic = "force-dynamic";

/**
 * Mueve el lead del contacto a una etapa del embudo (tool `actualizar_funnel` del bot).
 * POST /api/v1/accounts/:accountId/conversations/:conversationId/funnel
 * Header: api_access_token. Body: { etapa: "Contactado" }
 */
export async function POST(req: NextRequest, props: { params: Promise<{ accountId: string; conversationId: string }> }) {
  const params = await props.params;
  return conBot(req, async (bot) => {
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

    const antes = await oportunidadAbierta(conv.contactoId);
    const res = await moverLeadAEtapa(conv.contactoId, String(etapa), conv.contacto.nombre);
    if (!res.ok) return NextResponse.json(res, { status: 400 });
    await auditarBot(bot, conv.id, "mover_etapa", {
      entidad: "oportunidad",
      entidadId: BigInt(res.oportunidadId),
      antes: antes ? { etapaId: antes.etapaId, estado: antes.estado } : null,
      despues: { etapa: res.etapa, estado: res.estado }
    });
    return NextResponse.json(res);
  });
}
