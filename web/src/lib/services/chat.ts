import { db } from "@/lib/db";

// Las etiquetas viven en el contacto (las mismas de Contactos, Difusión y el bot).
const CONTACTO_CON_ETIQUETAS = { include: { etiquetas: { select: { etiqueta: { select: { nombre: true } } } } } } as const;

/** Nombres de las etiquetas del contacto de una conversación. */
export function etiquetasDeContacto(contacto: { etiquetas?: { etiqueta: { nombre: string } }[] } | null | undefined) {
  return (contacto?.etiquetas ?? []).map((e) => e.etiqueta.nombre);
}

/** Conversaciones para la bandeja: contacto + último mensaje (preview) + no leídos. */
export function listarConversaciones() {
  return db.conversacion.findMany({
    // Fijados (📌) primero, luego lo más reciente.
    orderBy: [{ fijadoAt: { sort: "desc", nulls: "last" } }, { ultimoMensajeAt: "desc" }],
    // ponytail: tope de las 200 más recientes; paginar por cursor si la bandeja necesita ver más viejas.
    take: 200,
    include: {
      contacto: CONTACTO_CON_ETIQUETAS,
      responsable: true,
      canal: true,
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
      contacto: CONTACTO_CON_ETIQUETAS,
      responsable: true,
      canal: true,
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
