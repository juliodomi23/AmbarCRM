import { NextRequest, NextResponse } from "next/server";
import { conBot, conversacionDelBot } from "@/lib/bot-auth";
import { db } from "@/lib/db";
import { conErrores } from "@/lib/errores-api";
import {
  cotizacionVencida,
  ESTADOS_COTIZACION,
  ZONA_COTIZACIONES,
  validarCotizacion,
} from "@/lib/cotizaciones";
import { crearCotizacion, ErrorCotizacion } from "@/lib/cotizaciones-db";
import { enlacePublicoCotizacion } from "@/lib/cotizacion-envio";
import { fechaLocal, sumarDias } from "@/lib/reservas/horarios";
import { crearLeadSiNoTiene } from "@/lib/services/funnel";
import { auditarBot } from "@/lib/services/bots";

export const dynamic = "force-dynamic";

const VIGENCIA_DIAS = 15;
type Props = { params: Promise<{ accountId: string; conversationId: string }> };

type CotizacionVista = {
  id: bigint;
  folio: string;
  estado: string;
  vigencia: Date;
  subtotal: unknown;
  descuento: unknown;
  impuestos: unknown;
  total: unknown;
  tokenPublico: string;
};

function partidasDelCuerpo(valor: unknown) {
  if (!Array.isArray(valor)) return valor;
  return valor.map((p) => (p && typeof p === "object" && p.productoId && !p.concepto ? { ...p, concepto: "Producto" } : p));
}

function resumen(c: CotizacionVista) {
  const guardado = c.estado;
  const vencida = ["borrador", "enviada"].includes(guardado) && cotizacionVencida(c.vigencia, new Date());
  return {
    id: Number(c.id),
    folio: c.folio,
    estado: vencida ? "vencida" : guardado,
    estado_guardado: guardado,
    vigencia: c.vigencia.toISOString().slice(0, 10),
    subtotal: Number(c.subtotal),
    descuento: Number(c.descuento),
    impuestos: Number(c.impuestos),
    total: Number(c.total),
    enlace: enlacePublicoCotizacion(c.tokenPublico),
  };
}

/**
 * Lista las cotizaciones del contacto de la conversación.
 * GET …/quotes?estado=enviada|aceptada|vencida|borrador|rechazada
 * `estado` es el efectivo: una enviada fuera de vigencia se reporta como vencida.
 */
async function manejarGET(req: NextRequest, props: Props) {
  const { conversationId } = await props.params;
  return conBot(req, async (botAutenticado) => {
    const acceso = await conversacionDelBot(botAutenticado, conversationId, "cotizaciones");
    if (!acceso.conv) return acceso.respuesta;

    const estado = req.nextUrl.searchParams.get("estado");
    if (estado && !(ESTADOS_COTIZACION as readonly string[]).includes(estado)) {
      return NextResponse.json({ error: `estado inválido (${ESTADOS_COTIZACION.join(", ")})` }, { status: 400 });
    }
    const filas = await db.cotizacion.findMany({
      where: { contactoId: acceso.conv.contactoId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const cotizaciones = filas.map(resumen).filter((c) => !estado || c.estado === estado);
    return NextResponse.json({ cotizaciones });
  });
}

/**
 * Crea una cotización para el contacto, colgada de su oportunidad abierta (se crea el lead si no hay).
 * IVA y totales se calculan en el servidor.
 * POST …/quotes  Body: { partidas: [{ productoId? | concepto + precio, cantidad, descuento? }],
 *                        descuento?, vigencia? (YYYY-MM-DD) | vigenciaDias?, notas?, condiciones? }
 */
async function manejarPOST(req: NextRequest, props: Props) {
  const { conversationId } = await props.params;
  return conBot(req, async (botAutenticado) => {
    const acceso = await conversacionDelBot(botAutenticado, conversationId, "cotizaciones");
    if (!acceso.conv) return acceso.respuesta;
    const { bot, conv } = acceso;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const dias = body.vigenciaDias === undefined ? VIGENCIA_DIAS : Number(body.vigenciaDias);
    if (!Number.isInteger(dias) || dias < 0 || dias > 365) {
      return NextResponse.json({ error: "vigenciaDias debe ser un entero de 0 a 365" }, { status: 400 });
    }
    const oportunidad = await crearLeadSiNoTiene(conv.contactoId, null, conv.contacto.nombre);
    if (!oportunidad) return NextResponse.json({ error: "no hay embudo configurado para ligar la cotización" }, { status: 422 });

    // El cliente y la oportunidad salen de la conversación, nunca del cuerpo; el bot no convierte en venta.
    const validacion = validarCotizacion({
      // Con productoId el nombre sale del catálogo; validarCotizacion pide un concepto, así que se rellena.
      partidas: partidasDelCuerpo(body.partidas ?? body.lineas),
      descuento: body.descuento,
      notas: body.notas,
      condiciones: body.condiciones,
      vigencia: body.vigencia ?? sumarDias(fechaLocal(new Date(), ZONA_COTIZACIONES), dias),
      contactoId: conv.contactoId.toString(),
      oportunidadId: oportunidad.id.toString(),
      convertirVenta: false,
    });
    if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });

    let cotizacion;
    try {
      cotizacion = await crearCotizacion(bot.orgId, null, validacion.data);
    } catch (error) {
      if (error instanceof ErrorCotizacion) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }
    await auditarBot(bot, conv.id, "cotizacion_creada", {
      entidad: "cotizacion",
      entidadId: cotizacion.id,
      despues: { folio: cotizacion.folio, total: cotizacion.total, partidas: cotizacion.partidas.length, oportunidadId: oportunidad.id },
    });
    return NextResponse.json(
      {
        ...resumen(cotizacion),
        oportunidad_id: Number(oportunidad.id),
        partidas: cotizacion.partidas.map((p) => ({
          concepto: p.concepto,
          cantidad: Number(p.cantidad),
          precio: Number(p.precio),
          descuento: Number(p.descuento),
          total: Number(p.total),
        })),
      },
      { status: 201 },
    );
  });
}

export const GET = conErrores(manejarGET);
export const POST = conErrores(manejarPOST);
