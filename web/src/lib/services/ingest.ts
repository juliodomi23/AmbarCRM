import { db } from "@/lib/db";
import { getProvider, type MensajeEntranteNormalizado } from "@/lib/channel";
import { instanciaPorDefecto } from "@/lib/channel/evolution";
import { getAjustes } from "@/lib/services/config";
import { botParaCanal, dispatchABot } from "@/lib/services/bots";
import { crearLeadSiNoTiene } from "@/lib/services/funnel";
import { capturarCsat } from "@/lib/services/csat";
import { estaFueraDeHorario } from "@/lib/horario";
import { aplicarVariables } from "@/lib/plantillas";
import { guardarMediaBase64 } from "@/lib/storage";

/** Elige el agente activo con menos conversaciones asignadas (round-robin por carga). */
async function elegirResponsable(): Promise<bigint | null> {
  const activos = await db.usuario.findMany({ where: { activo: true }, select: { id: true } });
  if (activos.length === 0) return null;

  const counts = await db.conversacion.groupBy({ by: ["responsableId"], _count: true });
  const carga = new Map(counts.map((c) => [c.responsableId?.toString() ?? "null", c._count]));

  let mejor = activos[0].id;
  let min = Infinity;
  for (const u of activos) {
    const n = carga.get(u.id.toString()) ?? 0;
    if (n < min) {
      min = n;
      mejor = u.id;
    }
  }
  return mejor;
}

/**
 * Ingesta de un mensaje entrante ya normalizado:
 * 1. Busca/crea el contacto por teléfono (auto-asigna responsable si está activado).
 * 2. Busca/crea la conversación (auto-asigna + manda bienvenida si es nueva).
 * 3. Inserta el mensaje (idempotente por wa_message_id).
 * 4. Actualiza no_leidos + ultimo_mensaje_at.
 * El INSERT en `mensajes` dispara el trigger que hace NOTIFY -> el SSE empuja al navegador.
 */
export async function ingestarEntrante(m: MensajeEntranteNormalizado, canalId: bigint | null) {
  // Idempotencia: si ya existe ese wa_message_id, no hacemos nada.
  if (m.waMessageId) {
    const existe = await db.mensaje.findUnique({ where: { waMessageId: m.waMessageId } });
    if (existe) return { duplicado: true as const, mensajeId: existe.id };
  }

  const ajustes = await getAjustes();
  const canal = canalId ? await db.canalWhatsapp.findUnique({ where: { id: canalId } }) : null;
  const provider = getProvider(canal?.proveedor ?? "evolution", canal?.config);
  const instancia = canal?.instancia?.trim() || instanciaPorDefecto;

  // --- Contacto ---
  let contacto = await db.contacto.findFirst({ where: { telefono: m.telefono } });
  if (!contacto) {
    const responsableId = ajustes.autoAsignar ? await elegirResponsable() : null;
    contacto = await db.contacto.create({
      data: { nombre: m.nombre ?? m.telefono, telefono: m.telefono, fuente: "whatsapp", responsableId }
    });
  }

  // --- Conversación ---
  let conversacion = await db.conversacion.findUnique({
    where: { contactoId_canalId: { contactoId: contacto.id, canalId: canalId as any } }
  });
  const esNuevaConversacion = !conversacion;
  if (!conversacion) {
    conversacion = await db.conversacion.create({
      data: { contactoId: contacto.id, canalId: canalId ?? undefined, responsableId: contacto.responsableId }
    });
  }

  // Contacto personal (familia/amigos): guarda solo texto, sin bot, sin lead, sin media.
  const esPersonal = contacto.esPersonal;

  // El media de WhatsApp viene cifrado: lo descargamos y guardamos local para poder verlo.
  // Se hace ANTES de crear el mensaje para que el INSERT (y el NOTIFY del SSE) ya traiga la URL servible.
  // Para contactos personales omitimos la descarga y guardado de media.
  let mediaUrl = m.mediaUrl;
  let mediaMime = m.mediaMime;
  if (m.tipo !== "texto" && m.raw && provider.descargarMedia && !esPersonal) {
    const media = await provider.descargarMedia(m.raw, instancia);
    if (media) {
      mediaUrl = await guardarMediaBase64(media.base64, media.mime);
      mediaMime = media.mime;
    }
  }

  const esSaliente = m.direccion === "saliente";

  const mensaje = await db.mensaje.create({
    data: {
      conversacionId: conversacion.id,
      direccion: esSaliente ? "saliente" : "entrante",
      tipo: m.tipo,
      contenido: m.contenido,
      mediaUrl,
      mediaMime,
      status: esSaliente ? "enviado" : "entregado",
      waMessageId: m.waMessageId,
      timestamp: m.timestamp
    }
  });

  await db.conversacion.update({
    where: { id: conversacion.id },
    data: esSaliente
      ? { ultimoMensajeAt: m.timestamp }
      : { noLeidos: { increment: 1 }, ultimoMensajeAt: m.timestamp, estado: "abierta" }
  });

  // Si lo mandó el propio número (desde el celular), no hay nada más que hacer:
  // no es un lead entrante, no notifica al bot, ni CSAT, ni bienvenida.
  if (esSaliente) {
    return { duplicado: false as const, mensajeId: mensaje.id, conversacionId: conversacion.id };
  }

  // Contacto personal: guardamos el mensaje pero no procesamos nada más.
  if (esPersonal) {
    return { duplicado: false as const, mensajeId: mensaje.id, conversacionId: conversacion.id };
  }

  // --- CSAT: si la conversación esperaba calificación y llegó un 1-5, lo guardamos y no seguimos ---
  if (await capturarCsat(conversacion, m.contenido)) {
    return { duplicado: false as const, mensajeId: mensaje.id, conversacionId: conversacion.id };
  }

  // --- Lead automático: cada contacto nuevo cae al embudo para que el bot/agente lo trabaje ---
  if (esNuevaConversacion && ajustes.crearLeadAuto) {
    await crearLeadSiNoTiene(contacto.id, contacto.responsableId, contacto.nombre);
  }

  // --- Fuera de horario: responde el autocontestador y no molesta al bot (máx. 1 cada 4 h por chat) ---
  if (ajustes.horarioActivo && ajustes.fueraHorarioTexto?.trim() && contacto.telefono && estaFueraDeHorario(ajustes)) {
    const haceMenosDe4h = conversacion.avisoFueraAt && Date.now() - conversacion.avisoFueraAt.getTime() < 4 * 60 * 60 * 1000;
    if (!haceMenosDe4h) {
      const texto = aplicarVariables(ajustes.fueraHorarioTexto, contacto);
      const envio = await provider.enviarTexto(contacto.telefono, texto);
      await db.mensaje.create({
        data: { conversacionId: conversacion.id, direccion: "saliente", tipo: "texto", contenido: texto, status: envio.ok ? "enviado" : "fallido", waMessageId: envio.waMessageId }
      });
      await db.conversacion.update({ where: { id: conversacion.id }, data: { avisoFueraAt: new Date(), ultimoMensajeAt: new Date() } });
    }
    return { duplicado: false as const, mensajeId: mensaje.id, conversacionId: conversacion.id };
  }

  // --- Bot: si hay uno configurado, le pasamos SIEMPRE el mensaje (su "If Bot On" decide con las labels) ---
  const bot = await botParaCanal(canalId);
  if (bot) {
    await dispatchABot(bot, {
      conversacionId: conversacion.id,
      contactoId: contacto.id,
      telefono: m.telefono,
      nombre: contacto.nombre,
      botActivo: conversacion.botActivo,
      mensaje: { id: mensaje.id, tipo: m.tipo, contenido: m.contenido ?? null, mediaUrl: mediaUrl ?? null }
    });
  }

  // --- Bienvenida automática (solo si NO hay bot; el bot saluda por su cuenta) ---
  if (!bot && esNuevaConversacion && ajustes.bienvenidaActiva && ajustes.bienvenidaTexto?.trim() && contacto.telefono) {
    const texto = aplicarVariables(ajustes.bienvenidaTexto, contacto);
    const envio = await provider.enviarTexto(contacto.telefono, texto);
    await db.mensaje.create({
      data: {
        conversacionId: conversacion.id,
        direccion: "saliente",
        tipo: "texto",
        contenido: texto,
        status: envio.ok ? "enviado" : "fallido",
        waMessageId: envio.waMessageId
      }
    });
    await db.conversacion.update({ where: { id: conversacion.id }, data: { ultimoMensajeAt: new Date() } });
  }

  return { duplicado: false as const, mensajeId: mensaje.id, conversacionId: conversacion.id };
}
