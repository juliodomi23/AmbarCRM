import { NextRequest, NextResponse } from "next/server";
import { conBot, conversacionDelBot } from "@/lib/bot-auth";
import { conErrores } from "@/lib/errores-api";
import { actualizarConversacion } from "@/lib/services/conversacion-estado";
import { enviarCsat } from "@/lib/services/csat";
import { auditarBot, notaDelBot } from "@/lib/services/bots";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ accountId: string; conversationId: string }> };
const estados = { open: "abierta", resolved: "cerrada", pending: "pendiente" } as const;
const inverso = { abierta: "open", cerrada: "resolved", pendiente: "pending" } as const;

async function manejarPATCH(req: NextRequest, props: Props) {
  const { conversationId } = await props.params;
  return conBot(req, "cambiar_estado", async (bot) => {
    const acceso = await conversacionDelBot(bot, conversationId);
    if (!acceso.conv) return acceso.respuesta;
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || !Object.hasOwn(estados, body.status)) {
      return NextResponse.json({ error: "status inválido" }, { status: 400 });
    }
    const estado = estados[body.status as keyof typeof estados];
    let anterior = acceso.conv.estado;
    let cambio = false;
    const despues = await actualizarConversacion(bot.orgId, acceso.conv.id, { estado }, "bot", (antes, actualizada) => {
      anterior = antes.estado;
      cambio = antes.estado !== actualizada.estado;
    });
    if (cambio) {
      await auditarBot(bot, despues.id, "estado_cambiado", {
        entidad: "conversacion", entidadId: despues.id,
        antes: { estado: anterior }, despues: { estado: despues.estado }
      });
      await notaDelBot(despues.id, `Cambió el estado a ${body.status}`);
      if (despues.estado === "cerrada") await enviarCsat(despues.id);
    }
    return NextResponse.json({ id: Number(despues.id), status: inverso[despues.estado],
      status_anterior: inverso[anterior], ...(cambio ? {} : { cambio: false }) });
  });
}

export const PATCH = conErrores(manejarPATCH);
