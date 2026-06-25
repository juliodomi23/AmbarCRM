import { db } from "@/lib/db";

/** Conversaciones para la bandeja: contacto + último mensaje (preview) + no leídos. */
export function listarConversaciones() {
  return db.conversacion.findMany({
    orderBy: { ultimoMensajeAt: "desc" },
    // ponytail: tope de las 200 más recientes; paginar por cursor si la bandeja necesita ver más viejas.
    take: 200,
    include: {
      contacto: true,
      responsable: true,
      mensajes: { orderBy: { timestamp: "desc" }, take: 1 }
    }
  });
}

/** Busca conversaciones donde algún mensaje contenga el texto (para búsqueda global). */
export function buscarEnMensajes(q: string) {
  return db.conversacion.findMany({
    where: {
      mensajes: {
        some: {
          contenido: { contains: q, mode: "insensitive" },
          interna: false
        }
      }
    },
    orderBy: { ultimoMensajeAt: "desc" },
    take: 30,
    include: {
      contacto: true,
      responsable: true,
      mensajes: { orderBy: { timestamp: "desc" }, take: 1 }
    }
  });
}

/** Mensajes de una conversación en orden cronológico. */
export function getMensajes(conversacionId: bigint) {
  return db.mensaje.findMany({
    where: { conversacionId },
    orderBy: { timestamp: "asc" }
  });
}

/** Marca la conversación como leída (no_leidos = 0). */
export function marcarLeida(conversacionId: bigint) {
  return db.conversacion.update({ where: { id: conversacionId }, data: { noLeidos: 0 } });
}

export function listarPlantillas() {
  return db.plantillaMensaje.findMany({ orderBy: { nombre: "asc" } });
}
