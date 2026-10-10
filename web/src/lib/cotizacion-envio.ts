import { getProvider, type PlantillaOficial } from "@/lib/channel";
import { configCotizaciones } from "@/lib/cotizaciones";
import { ErrorCotizacion } from "@/lib/cotizaciones-db";
import { db } from "@/lib/db";
import { estadoVentana } from "@/lib/meta/ventana";

export function canalEnvioCotizacion(ventanaAbierta: boolean, plantilla?: { name: string; language: string } | null) {
  if (ventanaAbierta) return "texto" as const;
  return plantilla?.name && plantilla.language ? "plantilla" as const : "sin_plantilla" as const;
}

export function enlacePublicoCotizacion(token: string) {
  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}/cotizacion/${token}` : null;
}

/** `conversacionId`: conversación desde la que se manda (bot); sin él, la más reciente del cliente. */
export async function enviarCotizacionWhatsapp(id: bigint, usuarioId: bigint | null, conversacionId?: bigint) {
  const cotizacion = await db.cotizacion.findUnique({
    where: { id },
    include: {
      contacto: {
        include: {
          conversaciones: {
            where: { ...(conversacionId !== undefined ? { id: conversacionId } : {}), canal: { activo: true, proveedor: "cloud_api" } },
            include: { canal: true },
            orderBy: { ultimoMensajeAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });
  if (!cotizacion) throw new ErrorCotizacion("Cotización no encontrada", 404);
  if (["aceptada", "rechazada", "vencida"].includes(cotizacion.estado)) {
    throw new ErrorCotizacion(`La cotización ya está ${cotizacion.estado}`, 409);
  }
  const conversacion = cotizacion.contacto.conversaciones[0];
  if (!cotizacion.contacto.telefono || !conversacion?.canal) {
    throw new ErrorCotizacion("El cliente no tiene una conversación de WhatsApp oficial", 409, "sin_conversacion_whatsapp");
  }
  const ultimoEntrante = await db.mensaje.findFirst({
    where: { conversacionId: conversacion.id, direccion: "entrante" },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "cotizaciones", activo: true }, select: { config: true } });
  const config = configCotizaciones(modulo?.config);
  const forma = canalEnvioCotizacion(estadoVentana(ultimoEntrante?.timestamp).abierta, config.plantillaCotizacion);
  if (forma === "sin_plantilla") {
    throw new ErrorCotizacion(
      "La ventana de 24 h está cerrada; configura una plantilla aprobada para cotizaciones",
      409,
      "ventana_cerrada_sin_plantilla",
    );
  }
  const enlace = enlacePublicoCotizacion(cotizacion.tokenPublico);
  if (!enlace) throw new ErrorCotizacion("Configura NEXTAUTH_URL para generar el enlace público", 409, "sin_url_publica");
  const texto = `Hola ${cotizacion.contacto.nombre}, puedes revisar la cotización ${cotizacion.folio} aquí: ${enlace}`;
  const provider = getProvider("cloud_api", conversacion.canal.config, conversacion.canal.instancia);
  let resultado;
  if (forma === "plantilla") {
    if (!provider.enviarPlantilla || !provider.consultarPlantillas) throw new ErrorCotizacion("El canal no admite plantillas", 409, "canal_sin_plantillas");
    const consulta = await provider.consultarPlantillas();
    if (!consulta.ok) {
      if (consulta.motivo === "sin_waba") {
        throw new ErrorCotizacion("El canal no tiene la cuenta de WhatsApp Business (WABA) configurada; no se pueden consultar plantillas", 409, "canal_sin_waba");
      }
      // No es "sin plantilla aprobada": no sabemos si la hay. Que el bot reintente más tarde.
      if (consulta.motivo === "no_disponible") {
        throw new ErrorCotizacion("WhatsApp no respondió al consultar las plantillas; intenta de nuevo", 503, "meta_no_disponible");
      }
      throw new ErrorCotizacion(`WhatsApp rechazó la consulta de plantillas: ${consulta.error}`, 502, "meta_rechazo");
    }
    const disponibles = consulta.plantillas;
    const aprobada = disponibles.find((plantilla: PlantillaOficial) => plantilla.name === config.plantillaCotizacion!.name && plantilla.status === "APPROVED");
    if (!aprobada) throw new ErrorCotizacion("La plantilla de cotización no está aprobada en Meta", 409, "plantilla_no_aprobada");
    resultado = await provider.enviarPlantilla(cotizacion.contacto.telefono, config.plantillaCotizacion!, [cotizacion.contacto.nombre, cotizacion.folio, enlace]);
  } else {
    resultado = await provider.enviarTexto(cotizacion.contacto.telefono, texto);
  }
  await db.mensaje.create({
    data: {
      conversacionId: conversacion.id,
      direccion: "saliente",
      tipo: forma,
      contenido: forma === "plantilla" ? `[Plantilla ${config.plantillaCotizacion!.name}] ${texto}` : texto,
      status: resultado.ok ? "enviado" : "fallido",
      errorDetalle: resultado.ok ? null : (resultado.error ?? "No se pudo enviar"),
      waMessageId: resultado.waMessageId,
      enviadoPor: usuarioId,
    },
  });
  if (!resultado.ok) throw new ErrorCotizacion(resultado.error ?? "No se pudo enviar la cotización", 502);
  await db.cotizacion.update({ where: { id }, data: { estado: "enviada", version: { increment: 1 } } });
  return { forma, enlace };
}
