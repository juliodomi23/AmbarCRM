// Endpoints del chat en la API simulada (bandeja, conversación, mensajes, programados, IA).
import { HORAS_VENTANA } from "@/lib/meta/ventana";
import { almacen, nuevoId } from "../almacen";
import { detalleConversacion, listaConversaciones, sesionDemo } from "../vistas";
import type { ConversacionD, MensajeD } from "../tipos";
import { ErrorApi, Respuesta, ruta } from "./ruteo";

const conversacion = (id: string): ConversacionD => {
  const c = almacen.datos.conversaciones.find((x) => x.id === id);
  if (!c) throw new ErrorApi(404, "no encontrada");
  return c;
};

const mensajesDe = (id: string) =>
  almacen.datos.mensajes.filter((m) => m.conversacionId === id).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

ruta("GET", "/api/conversaciones", ({ url }) => {
  const d = almacen.datos;
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length >= 2) {
    const ids = new Set(d.mensajes.filter((m) => !m.interna && (m.contenido ?? "").toLowerCase().includes(q)).map((m) => m.conversacionId));
    return { conversaciones: listaConversaciones(d, ids), esBusqueda: true };
  }
  return { conversaciones: listaConversaciones(d) };
});

ruta("GET", "/api/conversaciones/:id", ({ params }) => detalleConversacion(almacen.datos, conversacion(params.id)));

ruta("GET", "/api/conversaciones/:id/mensajes", ({ params }) => {
  const c = conversacion(params.id);
  const lista = mensajesDe(params.id);
  if (c.noLeidos) almacen.mutar(() => void (c.noLeidos = 0));
  return { mensajes: lista };
});

ruta("PATCH", "/api/conversaciones/:id", ({ params, cuerpo }) => {
  const c = conversacion(params.id);
  const d = almacen.datos;
  const cambios = ["responsableId", "estado", "botActivo", "fijado", "etiquetas"].filter((k) => k in cuerpo);
  if (!cambios.length) throw new ErrorApi(400, "nada que actualizar");
  almacen.mutar(() => {
    if ("responsableId" in cuerpo) {
      if (cuerpo.responsableId && !d.usuarios.some((u) => u.id === String(cuerpo.responsableId))) throw new ErrorApi(400, "responsable inexistente");
      c.responsableId = cuerpo.responsableId ? String(cuerpo.responsableId) : null;
    }
    if (["abierta", "pendiente", "cerrada"].includes(cuerpo.estado)) c.estado = cuerpo.estado;
    if (typeof cuerpo.botActivo === "boolean") c.botActivo = cuerpo.botActivo;
    if (typeof cuerpo.fijado === "boolean") c.fijadoAt = cuerpo.fijado ? new Date().toISOString() : null;
    if (Array.isArray(cuerpo.etiquetas)) {
      // Las etiquetas son del contacto: se reemplaza su conjunto.
      const contacto = d.contactos.find((x) => x.id === c.contactoId)!;
      const nombres = new Set<string>(cuerpo.etiquetas.map(String));
      contacto.etiquetaIds = d.etiquetas.filter((e) => nombres.has(e.nombre)).map((e) => e.id);
    }
  });
  return { ok: true };
});

ruta("DELETE", "/api/conversaciones/:id", ({ params }) => {
  conversacion(params.id);
  almacen.mutar((d) => {
    d.conversaciones = d.conversaciones.filter((c) => c.id !== params.id);
    d.mensajes = d.mensajes.filter((m) => m.conversacionId !== params.id);
  });
  return { ok: true };
});

const RESPUESTAS_CLIENTE = [
  "Perfecto, muchas gracias.",
  "Gracias, ¿a qué hora me confirmas?",
  "Listo, quedo atento.",
  "Excelente, ¿me compartes más detalles?",
];

/** Simula que el cliente contesta unos segundos después (llega por el «tiempo real» simulado). */
function simularRespuesta(conversacionId: string) {
  setTimeout(() => {
    const c = almacen.datos.conversaciones.find((x) => x.id === conversacionId);
    if (!c || c.estado === "cerrada") return;
    almacen.mutar((d) => {
      d.mensajes.push({
        id: nuevoId(),
        conversacionId,
        direccion: "entrante",
        tipo: "texto",
        contenido: RESPUESTAS_CLIENTE[d.mensajes.length % RESPUESTAS_CLIENTE.length],
        mediaUrl: null,
        interna: false,
        status: "entregado",
        timestamp: new Date().toISOString(),
      });
      c.noLeidos += 1;
      c.ultimoMensajeAt = new Date().toISOString();
    });
    almacen.emitir({ conversacion_id: Number(conversacionId), direccion: "entrante" });
  }, 4000);
}

ruta("POST", "/api/mensajes/enviar", ({ cuerpo }) => {
  const d = almacen.datos;
  const c = conversacion(String(cuerpo.conversacionId));
  const interna = cuerpo.interna === true;
  const esPlantilla = Boolean(cuerpo.plantilla);

  // Ventana de 24 h de WhatsApp: fuera de ella solo se puede con plantilla (como en el CRM real).
  if (!interna && !esPlantilla) {
    const ultimoEntrante = mensajesDe(c.id).filter((m) => m.direccion === "entrante" && !m.interna).pop();
    const cierre = ultimoEntrante ? new Date(ultimoEntrante.timestamp).getTime() + HORAS_VENTANA * 3_600_000 : 0;
    if (cierre < Date.now()) {
      return new Respuesta(409, { error: "La ventana de 24 h está cerrada: envía una plantilla aprobada", ventanaCerrada: true });
    }
  }

  let tipo = "texto";
  let mediaUrl: string | null = null;
  let contenido: string | null = cuerpo.texto ?? null;
  if (cuerpo.plantilla) contenido = cuerpo.plantilla.vistaPrevia ?? cuerpo.plantilla.name;
  if (cuerpo.mediaBase64) {
    const mime = String(cuerpo.mediaMime ?? "");
    tipo = mime.startsWith("image/") ? "imagen" : "documento";
    mediaUrl = cuerpo.mediaBase64;
    contenido = cuerpo.caption || null;
  }
  if (cuerpo.audioBase64) {
    tipo = "audio";
    mediaUrl = cuerpo.audioBase64;
    contenido = null;
  }
  if (!contenido && !mediaUrl) throw new ErrorApi(400, "mensaje vacío");

  const mensaje: MensajeD = {
    id: nuevoId(),
    conversacionId: c.id,
    direccion: "saliente",
    tipo,
    contenido,
    mediaUrl,
    interna,
    status: interna ? "entregado" : "enviado",
    timestamp: new Date().toISOString(),
  };
  almacen.mutar(() => {
    d.mensajes.push(mensaje);
    c.ultimoMensajeAt = mensaje.timestamp;
    if (!interna && !c.responsableId) c.responsableId = sesionDemo(d).id;
  });
  if (!interna) simularRespuesta(c.id);
  return { ok: true, mensaje };
});

ruta("GET", "/api/mensajes/programados", ({ url }) => {
  const id = url.searchParams.get("conversacionId");
  return { programados: almacen.datos.programados.filter((p) => !id || p.conversacionId === id) };
});
ruta("POST", "/api/mensajes/programados", ({ cuerpo }) => {
  const c = conversacion(String(cuerpo.conversacionId));
  if (!cuerpo.texto || !cuerpo.enviarAt) throw new ErrorApi(400, "faltan campos");
  almacen.mutar((d) => void d.programados.push({ id: nuevoId(), conversacionId: c.id, contenido: String(cuerpo.texto), enviarAt: cuerpo.enviarAt }));
  return { ok: true };
});
ruta("DELETE", "/api/mensajes/programados/:id", ({ params }) => {
  almacen.mutar((d) => void (d.programados = d.programados.filter((p) => p.id !== params.id)));
  return { ok: true };
});

ruta("POST", "/api/ia/sugerir", ({ cuerpo }) => {
  const c = conversacion(String(cuerpo.conversacionId));
  const contacto = almacen.datos.contactos.find((x) => x.id === c.contactoId)!;
  return { sugerencia: `Hola ${contacto.nombre.split(" ")[0]}, con gusto te ayudo. ¿Te parece si lo vemos esta semana? Dime qué día te acomoda mejor.` };
});

// Plantillas de Meta: la demo no tiene canal conectado.
ruta("GET", "/api/meta/templates", () => ({ plantillas: [] }));
