import { db, orgActual } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { getProvider, destinatarioDelCanal, type MensajeEntranteNormalizado } from "@/lib/channel";
import { getAjustes } from "@/lib/services/config";
import { botParaCanal, dispatchABot } from "@/lib/services/bots";
import { crearLeadSiNoTiene } from "@/lib/services/funnel";
import { capturarCsat } from "@/lib/services/csat";
import { estaFueraDeHorario } from "@/lib/horario";
import { aplicarVariables } from "@/lib/plantillas";
import { guardarMediaBase64 } from "@/lib/storage";
import { enviarPushAOrg } from "@/lib/push";
import { dispararEvento } from "@/lib/disparar-evento";

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
 * 1. Busca/crea el contacto por la identidad del canal (auto-asigna si está activado).
 * 2. Busca/crea la conversación (auto-asigna + manda bienvenida si es nueva).
 * 3. Inserta el mensaje (idempotente por wa_message_id).
 * 4. Actualiza no_leidos + ultimo_mensaje_at.
 * El INSERT en `mensajes` dispara el trigger que hace NOTIFY -> el SSE empuja al navegador.
 */
export async function ingestarEntrante(m: MensajeEntranteNormalizado, canalId: bigint | null) {
  // Idempotencia: si ya existe ese wa_message_id, no hacemos nada.
  if (m.waMessageId) {
    const existe = await db.mensaje.findFirst({ where: { canalId, waMessageId: m.waMessageId } });
    if (existe) return { duplicado: true as const, mensajeId: existe.id };
  }

  const ajustes = await getAjustes();
  const canal = canalId ? await db.canalWhatsapp.findUnique({ where: { id: canalId } }) : null;
  if (!canal) throw new Error("canal inexistente");
  const provider = getProvider(canal.proveedor, canal.config, canal.instancia);
  const esWhatsapp = canal.proveedor === "cloud_api";
  if (esWhatsapp ? !m.telefono : !m.identificadorExterno) throw new Error("falta identidad del contacto");

  const identidad = esWhatsapp ? { telefono: m.telefono } : { canalId: canal.id, identificadorExterno: m.identificadorExterno };
  const previo = await db.contacto.findFirst({ where: identidad });
  let mediaUrl = m.mediaUrl;
  let mediaMime = m.mediaMime;
  if (m.tipo !== "texto" && m.raw && provider.descargarMedia && !previo?.esPersonal) {
    const media = await provider.descargarMedia(m.raw, canal.instancia || "");
    if (media) {
      mediaUrl = await guardarMediaBase64(media.base64, media.mime);
      mediaMime = media.mime;
    }
  }
  const orgId = await orgActual();
  if (orgId == null) throw new Error("ingesta sin empresa");
  const responsableId = ajustes.autoAsignar ? await elegirResponsable() : null;
  const esSaliente = m.direccion === "saliente";
  const guardado = await transaccionTenant(orgId, async (tx) => {
    // Serializa la identidad y el mensaje antes de disparar efectos externos.
    await tx.$queryRaw`SELECT id FROM canales_whatsapp WHERE id = ${canal.id} FOR UPDATE`;
    const existente = await tx.mensaje.findFirst({ where: { canalId: canal.id, waMessageId: m.waMessageId } });
    if (existente) return { duplicado: true as const, mensajeId: existente.id, conversacionId: existente.conversacionId };
    let contacto = await tx.contacto.findFirst({ where: identidad });
    const esNuevoContacto = !contacto;
    const telefonoDisponible = m.telefono && !esWhatsapp
      ? !(await tx.contacto.findFirst({ where: { telefono: m.telefono, ...(contacto ? { id: { not: contacto.id } } : {}) } }))
      : false;
    if (!contacto) contacto = await tx.contacto.create({ data: {
      nombre: m.nombre ?? m.telefono ?? m.identificadorExterno!,
      avatarUrl: m.avatarUrl,
      telefono: esWhatsapp || telefonoDisponible ? m.telefono : null,
      ...(!esWhatsapp ? { canalId: canal.id, identificadorExterno: m.identificadorExterno } : {}),
      fuente: esWhatsapp ? "whatsapp" : "otro", responsableId,
    } });
    if (!esWhatsapp && !contacto.telefono && telefonoDisponible) {
      contacto = await tx.contacto.update({ where: { id: contacto.id }, data: { telefono: m.telefono } });
    }
    let conversacion = await tx.conversacion.findUnique({ where: { contactoId_canalId: { contactoId: contacto.id, canalId: canal.id } } });
    const esNuevaConversacion = !conversacion;
    if (!conversacion) conversacion = await tx.conversacion.create({ data: {
      contactoId: contacto.id, canalId: canal.id, responsableId: contacto.responsableId,
    } });
    const mensaje = await tx.mensaje.create({ data: {
      conversacionId: conversacion.id, direccion: esSaliente ? "saliente" : "entrante",
      tipo: m.tipo, contenido: m.contenido, mediaUrl, mediaMime,
      status: esSaliente ? "enviado" : "entregado", waMessageId: m.waMessageId, timestamp: m.timestamp,
    } });
    const ultimoEntranteAt = !esSaliente && (!conversacion.ultimoEntranteAt || conversacion.ultimoEntranteAt < m.timestamp)
      ? m.timestamp : conversacion.ultimoEntranteAt;
    await tx.conversacion.update({ where: { id: conversacion.id }, data: { ultimoEntranteAt, ...(m.historico
      ? { ultimoMensajeAt: m.timestamp }
      : esSaliente ? { ultimoMensajeAt: m.timestamp, noLeidos: 0 }
      : { noLeidos: { increment: 1 }, ultimoMensajeAt: m.timestamp, estado: "abierta" as const }) } });
    return { duplicado: false as const, contacto, conversacion, mensaje, esNuevaConversacion, esNuevoContacto };
  });
  if (guardado.duplicado) return guardado;
  const { contacto, conversacion, mensaje, esNuevaConversacion } = guardado;
  const esPersonal = contacto.esPersonal;
  const destinatario = destinatarioDelCanal(canal.proveedor, contacto);
  const contexto = { conversacionId: conversacion.id, ultimoEntranteAt: m.timestamp, humano: false };

  // El historial de Coexistence solo reconstruye el chat. No debe generar leads,
  // notificaciones, respuestas automáticas, CSAT ni llamadas a bots.
  if (m.historico) {
    return { duplicado: false as const, mensajeId: mensaje.id, conversacionId: conversacion.id };
  }

  // Si lo mandó el propio número (desde el celular), no hay nada más que hacer:
  // no es un lead entrante, no notifica al bot, ni CSAT, ni bienvenida.
  if (esSaliente) {
    return { duplicado: false as const, mensajeId: mensaje.id, conversacionId: conversacion.id };
  }

  // Contacto personal: guardamos el mensaje pero no procesamos nada más.
  if (esPersonal) {
    return { duplicado: false as const, mensajeId: mensaje.id, conversacionId: conversacion.id };
  }

  const contextoEvento = { conversacionId: String(conversacion.id), contactoNuevo: guardado.esNuevoContacto,
    texto: m.contenido, origen: "contacto" as const };
  const datosEvento = { id: String(conversacion.id), conversacion_id: String(conversacion.id),
    contacto_id: String(contacto.id), canal_id: String(canal.id), estado: "abierta" };
  if (guardado.esNuevoContacto) dispararEvento(orgId, "contacto.creado", {
    id: String(contacto.id), nombre: contacto.nombre,
  });
  if (esNuevaConversacion) dispararEvento(orgId, "conversacion.creada", datosEvento, contextoEvento);
  else if (conversacion.estado !== "abierta") dispararEvento(orgId, "conversacion.estado_cambiado", {
    ...datosEvento, estado_anterior: conversacion.estado,
  }, contextoEvento);
  dispararEvento(orgId, "mensaje.recibido", { ...datosEvento, id: String(mensaje.id), tipo: mensaje.tipo }, contextoEvento);

  // Push a los dispositivos del equipo (fire-and-forget: no frena el webhook).
  const preview = m.contenido?.slice(0, 120) || (m.tipo !== "texto" ? `[${m.tipo}]` : "Mensaje nuevo");
  void enviarPushAOrg(contacto.nombre, preview, `/chat?conv=${conversacion.id}`).catch(() => {});

  // --- CSAT: si la conversación esperaba calificación y llegó un 1-5, lo guardamos y no seguimos ---
  if (await capturarCsat(conversacion, m.contenido)) {
    return { duplicado: false as const, mensajeId: mensaje.id, conversacionId: conversacion.id };
  }

  // --- Lead automático: cada contacto nuevo cae al embudo para que el bot/agente lo trabaje ---
  if (esNuevaConversacion && ajustes.crearLeadAuto) {
    await crearLeadSiNoTiene(contacto.id, contacto.responsableId, contacto.nombre);
  }

  // --- Fuera de horario: responde el autocontestador y no molesta al bot (máx. 1 cada 4 h por chat) ---
  if (ajustes.horarioActivo && ajustes.fueraHorarioTexto?.trim() && destinatario && estaFueraDeHorario(ajustes)) {
    const haceMenosDe4h = conversacion.avisoFueraAt && Date.now() - conversacion.avisoFueraAt.getTime() < 4 * 60 * 60 * 1000;
    if (!haceMenosDe4h) {
      const texto = aplicarVariables(ajustes.fueraHorarioTexto, contacto);
      const envio = await provider.enviarTexto(destinatario, texto, contexto);
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
      telefono: contacto.telefono ?? "",
      identificadorExterno: m.identificadorExterno,
      nombre: contacto.nombre,
      botActivo: conversacion.botActivo,
      mensaje: { id: mensaje.id, tipo: m.tipo, contenido: m.contenido ?? null, mediaUrl: mediaUrl ?? null }
    });
  }

  // --- Bienvenida automática (solo si NO hay bot; el bot saluda por su cuenta) ---
  if (!bot && esNuevaConversacion && ajustes.bienvenidaActiva && ajustes.bienvenidaTexto?.trim() && destinatario) {
    const texto = aplicarVariables(ajustes.bienvenidaTexto, contacto);
    const envio = await provider.enviarTexto(destinatario, texto, contexto);
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
