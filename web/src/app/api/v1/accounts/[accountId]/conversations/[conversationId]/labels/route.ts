import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { botAutorizado, conBot } from "@/lib/bot-auth";
import { aBigInt } from "@/lib/ids";
import { auditarBot, escalarAHumano } from "@/lib/services/bots";

export const dynamic = "force-dynamic";

const ETIQUETAS_HANDOFF = ["escalado_humano", "bot_off"];
const ETIQUETA_REACTIVAR = "bot_on";
const MAX_ETIQUETAS = 10;
const MAX_LARGO = 40;

/**
 * El bot manda etiquetas de la conversación.
 * - `escalado_humano` / `bot_off`: handoff (apaga el bot, deja pendiente, asigna asesor, nota interna).
 * - `bot_on`: reactiva el bot solo si la conversación no tiene responsable; si lo tiene (un humano
 *   la atiende) responde 409 `asignada_a_humano`, el bot sigue como estaba y queda en la bitácora.
 * - Cualquier otra: se agrega al contacto (nunca quita las existentes y NO cambia el estado del bot).
 * POST /api/v1/accounts/:accountId/conversations/:conversationId/labels
 * Body: { labels: string[], motivo?: string }
 */
export async function POST(req: NextRequest, props: { params: Promise<{ accountId: string; conversationId: string }> }) {
  const params = await props.params;
  return conBot(req, "handoff", async (bot) => {
    const convId = aBigInt(params.conversationId);
    if (convId === null) return NextResponse.json({ error: "conversationId inválido" }, { status: 400 });

    const conv = await db.conversacion.findUnique({
      where: { id: convId },
      select: { id: true, canalId: true, contactoId: true, botActivo: true, responsableId: true }
    });
    if (!conv) return NextResponse.json({ error: "conversación inexistente" }, { status: 404 });
    if (!botAutorizado(bot, conv)) return NextResponse.json({ error: "el bot no opera en este canal" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const labels: string[] = Array.isArray(body.labels) ? body.labels.map(String) : [];
    const handoff = labels.some((l) => ETIQUETAS_HANDOFF.includes(l));
    const reactivar = !handoff && labels.includes(ETIQUETA_REACTIVAR);
    const motivo = String(body.motivo ?? body.reason ?? "").trim().slice(0, 300) || "el bot escaló la conversación.";

    const nombres = [
      ...new Set(
        labels
          .map((l) => l.trim().slice(0, MAX_LARGO))
          .filter((l) => l && !ETIQUETAS_HANDOFF.includes(l) && l !== ETIQUETA_REACTIVAR)
      )
    ].slice(0, MAX_ETIQUETAS);

    for (const nombre of nombres) {
      const etiqueta = await db.etiqueta.upsert({
        where: { orgId_nombre: { orgId: bot.orgId, nombre } },
        update: {},
        create: { nombre }
      });
      await db.contactoEtiqueta.upsert({
        where: { contactoId_etiquetaId: { contactoId: conv.contactoId, etiquetaId: etiqueta.id } },
        update: {},
        create: { contactoId: conv.contactoId, etiquetaId: etiqueta.id }
      });
    }
    if (nombres.length) {
      await auditarBot(bot, conv.id, "etiquetas", { entidad: "contacto", entidadId: conv.contactoId, despues: { etiquetas: nombres } });
    }

    let botActivo = conv.botActivo;
    let handoffResultado: { escalada: boolean; responsableId: string | null } | undefined;
    if (handoff) {
      const r = await escalarAHumano(bot, conv.id, motivo);
      botActivo = false;
      handoffResultado = { escalada: r?.escalada ?? false, responsableId: r?.responsableId?.toString() ?? null };
    } else if (reactivar) {
      // Condición en el UPDATE (no solo en la lectura): si un humano toma la conversación entre
      // medias, tampoco se reactiva.
      const { count } = await db.conversacion.updateMany({
        where: { id: conv.id, responsableId: null },
        data: { botActivo: true }
      });
      if (count === 0) {
        await auditarBot(bot, conv.id, "bot_reactivado_rechazado", {
          entidad: "conversacion",
          entidadId: conv.id,
          antes: { botActivo: conv.botActivo, responsableId: conv.responsableId },
          despues: { botActivo: conv.botActivo, motivo: "asignada_a_humano" }
        });
        return NextResponse.json(
          {
            error: "la conversación está asignada a un humano; el bot no se reactiva",
            motivo: "asignada_a_humano",
            bot_activo: conv.botActivo,
            etiquetas_guardadas: nombres
          },
          { status: 409 }
        );
      }
      await auditarBot(bot, conv.id, "bot_reactivado", {
        entidad: "conversacion",
        entidadId: conv.id,
        antes: { botActivo: conv.botActivo },
        despues: { botActivo: true }
      });
      botActivo = true;
    }

    return NextResponse.json({
      payload: labels,
      bot_activo: botActivo,
      etiquetas_guardadas: nombres,
      ...(handoffResultado ? { handoff: handoffResultado } : {})
    });
  });
}
