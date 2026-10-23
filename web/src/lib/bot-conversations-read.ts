import type { Prisma } from "@prisma/client";

export const conversacionInclude = {
  contacto: { include: { etiquetas: { include: { etiqueta: true } } } },
  canal: { select: { proveedor: true } },
  responsable: { select: { id: true, nombre: true } }
} as const;

export type ConversacionBot = Prisma.ConversacionGetPayload<{ include: typeof conversacionInclude }>;
export type MensajeBot = Prisma.MensajeGetPayload<{ include: { usuario: { select: { id: true; nombre: true } } } }>;
export type OportunidadBot = Prisma.OportunidadGetPayload<{ include: { etapa: { select: { nombre: true } } } }>;

const segundos = (fecha: Date) => Math.floor(fecha.getTime() / 1000);
const urlAdjunto = (url: string) => url.startsWith("/") ? `${process.env.NEXTAUTH_URL ?? ""}${url}` : url;

export function serializarMensaje(m: MensajeBot, contacto: { id: bigint; nombre: string }, bot: { id: bigint; nombre: string }) {
  const tipoArchivo = m.tipo === "imagen" ? "image" : m.tipo === "audio" ? "audio" : m.tipo === "ubicacion" ? "location" : "file";
  const sender = m.direccion === "entrante"
    ? { type: "contact", id: Number(contacto.id), name: contacto.nombre }
    : m.usuario
      ? { type: "user", id: Number(m.usuario.id), name: m.usuario.nombre }
      : { type: "agent_bot", id: Number(bot.id), name: bot.nombre };
  return {
    id: Number(m.id),
    content: m.contenido ?? "",
    message_type: m.interna ? 2 : m.direccion === "entrante" ? 0 : 1,
    created_at: segundos(m.createdAt),
    sender,
    attachments: m.mediaUrl && m.tipo !== "texto" ? [{ file_type: tipoArchivo, data_url: urlAdjunto(m.mediaUrl) }] : [],
    private: m.interna
  };
}

export function serializarConversacion(
  conv: ConversacionBot,
  recientes: MensajeBot[],
  oportunidad: OportunidadBot | null,
  ultimo: MensajeBot | null,
  opciones: {
    etiquetasEnLabels?: boolean;
    messages?: ReturnType<typeof serializarMensaje>[];
    messagesTruncated?: boolean;
  } = {}
) {
  const sender = {
    identifier: conv.canal?.proveedor === "cloud_api" ? conv.contacto.telefono : conv.contacto.identificadorExterno ?? conv.contacto.telefono,
    name: conv.contacto.nombre,
    phone_number: conv.contacto.telefono ? `+${conv.contacto.telefono}` : null
  };
  const etiquetas = conv.contacto.etiquetas.map((e) => e.etiqueta.nombre);
  const labels = conv.botActivo ? [] : ["bot_off"];
  if (opciones.etiquetasEnLabels) labels.push(...etiquetas.filter((e) => !labels.includes(e)));
  return {
    id: Number(conv.id),
    status: conv.estado === "cerrada" ? "resolved" : conv.estado === "pendiente" ? "pending" : "open",
    bot_activo: conv.botActivo,
    canal: conv.canal?.proveedor ?? null,
    labels,
    can_reply: true,
    meta: { sender },
    mensajes: recientes.map((m) => ({
      id: Number(m.id),
      message_type: m.direccion === "entrante" ? "incoming" : "outgoing",
      sender: m.direccion === "entrante" ? "contact" : m.enviadoPor == null ? "bot" : "agent",
      tipo: m.tipo,
      content: m.contenido ?? "",
      created_at: m.timestamp.toISOString()
    })),
    perfil: {
      etiquetas,
      campos: conv.contacto.campos,
      responsable: conv.responsable ? { id: Number(conv.responsable.id), nombre: conv.responsable.nombre } : null,
      oportunidad: oportunidad ? {
        id: Number(oportunidad.id), titulo: oportunidad.titulo, etapa: oportunidad.etapa.nombre,
        valor: Number(oportunidad.valor), moneda: oportunidad.moneda
      } : null
    },
    contacto: { id: Number(conv.contacto.id), nombre: conv.contacto.nombre, telefono: conv.contacto.telefono },
    etapa: oportunidad?.etapa.nombre ?? null,
    created_at: segundos(conv.createdAt),
    updated_at: segundos(conv.updatedAt),
    last_activity_at: segundos(conv.ultimoMensajeAt ?? conv.updatedAt),
    last_message: ultimo ? {
      id: Number(ultimo.id), content: ultimo.contenido ?? "",
      message_type: ultimo.interna ? 2 : ultimo.direccion === "entrante" ? 0 : 1,
      created_at: segundos(ultimo.createdAt)
    } : null,
    ...(opciones.messages === undefined ? {} : {
      messages: opciones.messages,
      messages_truncated: opciones.messagesTruncated ?? false
    })
  };
}
