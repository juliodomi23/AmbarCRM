import { NextRequest, NextResponse } from "next/server";
import { conBot, conversacionDelBot } from "@/lib/bot-auth";
import { db } from "@/lib/db";
import { conErrores } from "@/lib/errores-api";
import { serializar } from "@/lib/serialize";
import { TEXTO_ESTADO_TALLER } from "@/lib/taller-mensajes";
import { asegurarTokenSeguimiento, enlaceSeguimientoTaller } from "@/lib/taller-whatsapp";

type Props = { params: Promise<{ accountId: string; conversationId: string }> };

const DIAS_HISTORIAL_ENTREGADO = 7;

/**
 * GET /api/v1/accounts/:accountId/conversations/:conversationId/taller/ordenes
 * Órdenes de taller del contacto de la conversación (solo lectura). No expone
 * conceptos ni precios unitarios: únicamente estado, vehículo, promesa y saldo.
 */
async function manejarGET(req: NextRequest, props: Props) {
  const { conversationId } = await props.params;
  return conBot(req, "consultar_taller", async (botAutenticado) => {
    const acceso = await conversacionDelBot(botAutenticado, conversationId, "taller");
    if (!acceso.conv) return acceso.respuesta;
    const desde = new Date(Date.now() - DIAS_HISTORIAL_ENTREGADO * 24 * 60 * 60 * 1000);
    const ordenes = await db.tallerOrden.findMany({
      where: {
        vehiculo: { contactoId: acceso.conv.contactoId },
        OR: [
          { estado: { notIn: ["entregado", "cancelado"] } },
          { estado: "entregado", updatedAt: { gte: desde } },
        ],
      },
      select: {
        id: true,
        numero: true,
        estado: true,
        fechaPromesa: true,
        total: true,
        seguimientoToken: true,
        vehiculo: { select: { marca: true, modelo: true, anio: true, placa: true } },
        pagos: { select: { monto: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });

    const salida = [];
    for (const orden of ordenes) {
      const pagado = orden.pagos.reduce((suma, pago) => suma + Number(pago.monto), 0);
      let enlace: string | null = null;
      try {
        const token = await asegurarTokenSeguimiento(orden.id, orden.seguimientoToken);
        enlace = enlaceSeguimientoTaller(botAutenticado.orgId, token);
      } catch {
        // Sin NEXTAUTH_URL el bot puede seguir respondiendo con el estado.
        enlace = null;
      }
      salida.push({
        id: orden.id,
        numero: orden.numero,
        estado: orden.estado,
        estadoTexto: TEXTO_ESTADO_TALLER[orden.estado] ?? orden.estado.replaceAll("_", " "),
        vehiculo: orden.vehiculo,
        fechaPromesa: orden.fechaPromesa,
        saldo: Math.max(0, Number(orden.total) - pagado),
        enlaceSeguimiento: enlace,
      });
    }
    return NextResponse.json(serializar({ ordenes: salida }));
  });
}

export const GET = conErrores(manejarGET);
