import { NextRequest, NextResponse } from "next/server";
import { conBot, conversacionDelBot } from "@/lib/bot-auth";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { ErrorCotizacion } from "@/lib/cotizaciones-db";
import { enviarCotizacionWhatsapp } from "@/lib/cotizacion-envio";
import { auditarBot } from "@/lib/services/bots";

export const dynamic = "force-dynamic";

/**
 * Manda el enlace público de la cotización por WhatsApp desde la conversación.
 * Dentro de la ventana de 24 h va como texto; fuera, como plantilla aprobada. Sin plantilla
 * aprobada responde 409 con `motivo` (ventana_cerrada_sin_plantilla | plantilla_no_aprobada | …).
 * POST …/quotes/:quoteId/send
 */
export async function POST(req: NextRequest, props: { params: Promise<{ accountId: string; conversationId: string; quoteId: string }> }) {
  const { conversationId, quoteId } = await props.params;
  return conBot(req, "cotizar", async (botAutenticado) => {
    const acceso = await conversacionDelBot(botAutenticado, conversationId, "cotizaciones");
    if (!acceso.conv) return acceso.respuesta;
    const { bot, conv } = acceso;

    const id = aBigInt(quoteId);
    if (id === null) return NextResponse.json({ error: "quoteId inválido" }, { status: 400 });
    // Solo cotizaciones del contacto de esta conversación.
    const cotizacion = await db.cotizacion.findFirst({ where: { id, contactoId: conv.contactoId } });
    if (!cotizacion) return NextResponse.json({ error: "cotización inexistente" }, { status: 404 });

    try {
      const envio = await enviarCotizacionWhatsapp(id, null, conv.id);
      await auditarBot(bot, conv.id, "cotizacion_enviada", {
        entidad: "cotizacion",
        entidadId: id,
        antes: { estado: cotizacion.estado },
        despues: { estado: "enviada", forma: envio.forma },
      });
      return NextResponse.json({ id: Number(id), folio: cotizacion.folio, estado: "enviada", forma: envio.forma, enlace: envio.enlace });
    } catch (error) {
      if (error instanceof ErrorCotizacion) {
        return NextResponse.json({ error: error.message, ...(error.codigo ? { motivo: error.codigo } : {}) }, { status: error.status });
      }
      // Falla al consultar plantillas o red con Meta: no es un error del cliente ni 500 del CRM.
      console.error("envío de cotización por bot falló:", error instanceof Error ? error.message : error);
      return NextResponse.json({ error: "no se pudo contactar a WhatsApp", motivo: "proveedor_no_disponible" }, { status: 502 });
    }
  });
}
