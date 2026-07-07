import type {
  ActualizacionEstado,
  ChannelProvider,
  DatosConexion,
  EstadoConexion,
  EstadoMensaje,
  ImportChat,
  ImportContacto,
  MensajeEntranteNormalizado,
  MensajeGrupoNormalizado,
  MensajeHistorial,
  ResultadoEnvio,
  TipoMensaje
} from "./types";

// Sin slash final: las rutas se concatenan como `${BASE}/instance/...` y un
// slash extra produce `//instance/...`, que Evolution responde con 404.
const BASE = (process.env.EVOLUTION_API_URL ?? "").replace(/\/+$/, "");
const APIKEY = process.env.EVOLUTION_API_KEY ?? "";
const INSTANCE = process.env.EVOLUTION_INSTANCE ?? "ambarcrm";

/** Nombre de instancia por defecto (el que usan los envíos). Lo usa la UI para no dejar el canal sin instancia. */
export const instanciaPorDefecto = INSTANCE;

/** Petición genérica a Evolution. Devuelve { ok, status, data }. */
async function req(
  metodo: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", apikey: APIKEY },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(`[evolution] ${metodo} ${path} -> ${res.status}`, JSON.stringify(data).slice(0, 300));
    }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    console.warn(`[evolution] ${metodo} ${path} -> red KO (BASE="${BASE}")`, e instanceof Error ? e.message : e);
    return { ok: false, status: 0, data: { message: e instanceof Error ? e.message : "error de red" } };
  }
}

/** Traduce el estado de Evolution (open/connecting/close) al nuestro. */
function mapEstado(state?: string): EstadoConexion {
  if (state === "open") return "conectado";
  if (state === "connecting") return "conectando";
  return "desconectado";
}

/** Normaliza el QR a un data URI usable en <img src>. */
function comoDataUri(base64?: string): string | undefined {
  if (!base64) return undefined;
  return base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
}

/** Traduce el acuse de Evolution a nuestro estado de mensaje. */
function mapStatusEvolution(s?: string): EstadoMensaje | null {
  switch (s) {
    case "SENT":
    case "SERVER_ACK":
      return "enviado";
    case "DELIVERED":
    case "DELIVERY_ACK":
      return "entregado";
    case "READ":
    case "READ_ACK":
    case "PLAYED":
      return "leido";
    case "ERROR":
      return "fallido";
    default:
      return null;
  }
}

/** Quita sufijos de WhatsApp (@s.whatsapp.net) y deja solo dígitos. */
function soloDigitos(jid: string): string {
  return (jid || "").split("@")[0].replace(/\D/g, "");
}

function mapTipoMedia(tipo: TipoMensaje): "image" | "video" | "audio" | "document" {
  if (tipo === "imagen") return "image";
  if (tipo === "video") return "video";
  if (tipo === "audio") return "audio";
  return "document";
}

async function post(path: string, body: unknown): Promise<ResultadoEnvio> {
  const { ok, status, data } = await req("POST", path, body);
  if (!ok) return { ok: false, error: data?.message ?? `HTTP ${status}` };
  return { ok: true, waMessageId: data?.key?.id ?? data?.id };
}

/**
 * Construye el provider ATADO a una instancia de Evolution. Cada canal (tenant) tiene la
 * suya; los envíos deben salir por la instancia del canal, no por la global del env.
 */
function buildProvider(inst: string): ChannelProvider {
  return {
  nombre: "evolution",

  async enviarTexto(telefono, texto) {
    return post(`/message/sendText/${inst}`, { number: telefono, text: texto });
  },

  async enviarMedia(telefono, mediaUrl, tipo, caption, mimetype) {
    // Evolution quiere URL o base64 PURO (sin el prefijo data:...;base64,).
    const media = mediaUrl.startsWith("data:") ? mediaUrl.split(",")[1] : mediaUrl;
    const ext = (mimetype?.split("/")[1] || "bin").split(";")[0];
    return post(`/message/sendMedia/${inst}`, {
      number: telefono,
      mediatype: mapTipoMedia(tipo),
      mimetype: mimetype || undefined,
      media,
      fileName: `archivo.${ext}`,
      caption: caption ?? ""
    });
  },

  async enviarAudio(telefono, audioBase64) {
    // Evolution convierte el audio a ogg/opus y lo manda como nota de voz (PTT).
    return post(`/message/sendWhatsAppAudio/${inst}`, { number: telefono, audio: audioBase64 });
  },

  async conectar(instancia): Promise<DatosConexion> {
    // 1. Crear la instancia (idempotente: si ya existe Evolution responde 403/409 y seguimos).
    const creada = await req("POST", "/instance/create", {
      instanceName: instancia,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true
    });
    if (!creada.ok && creada.status !== 403 && creada.status !== 409) {
      // 403/409 = "ya existe": no es error real. Cualquier otro sí.
      const yaExiste = JSON.stringify(creada.data).toLowerCase().includes("already");
      if (!yaExiste) {
        return { ok: false, estado: "desconectado", error: creada.data?.message ?? `HTTP ${creada.status}` };
      }
    }

    // El create puede ya traer el QR; si no, lo pedimos con /instance/connect.
    let qr = comoDataUri(creada.data?.qrcode?.base64);
    let pairingCode: string | undefined = creada.data?.qrcode?.pairingCode;

    if (!qr) {
      const conn = await req("GET", `/instance/connect/${instancia}`);
      if (!conn.ok) {
        return { ok: false, estado: "desconectado", error: conn.data?.message ?? `HTTP ${conn.status}` };
      }
      qr = comoDataUri(conn.data?.base64 ?? conn.data?.qrcode?.base64);
      pairingCode = conn.data?.pairingCode ?? conn.data?.code ?? pairingCode;
    }

    if (!qr && !pairingCode) {
      // Sin QR ni código suele significar que ya estaba vinculada.
      const est = await this.estadoConexion!(instancia);
      return { ok: true, estado: est.estado, telefono: est.telefono };
    }

    return { ok: true, estado: "conectando", qrBase64: qr, pairingCode };
  },

  async estadoConexion(instancia) {
    const { ok, data } = await req("GET", `/instance/connectionState/${instancia}`);
    if (!ok) return { estado: "desconectado" as EstadoConexion };
    const inst = data?.instance ?? data;
    return {
      estado: mapEstado(inst?.state),
      telefono: inst?.owner ? inst.owner.split("@")[0].replace(/\D/g, "") : undefined
    };
  },

  async desconectar(instancia) {
    const { ok, status, data } = await req("DELETE", `/instance/logout/${instancia}`);
    if (!ok) return { ok: false, error: data?.message ?? `HTTP ${status}` };
    return { ok: true };
  },

  normalizarEntrante(payload) {
    // Evolution v2 manda { event, instance, data } donde data = mensaje(s).
    const raw = payload as any;
    const data = raw?.data;
    if (!data) return [];
    const items = Array.isArray(data) ? data : [data];

    const out: MensajeEntranteNormalizado[] = [];
    for (const m of items) {
      // Solo chats individuales: ignora grupos (@g.us), estados y difusiones.
      const telefono = jidIndividual(m?.key?.remoteJid ?? "");
      if (!telefono) continue;
      const { tipo, contenido, mediaUrl, mediaMime } = extraerContenido(m?.message ?? {});

      out.push({
        waMessageId: m?.key?.id ?? `${Date.now()}-${Math.random()}`,
        telefono,
        nombre: m?.pushName,
        tipo,
        contenido,
        mediaUrl,
        mediaMime,
        // fromMe = lo mandó el propio número (desde el celular) -> saliente.
        direccion: m?.key?.fromMe ? "saliente" : "entrante",
        raw: m,
        timestamp: m?.messageTimestamp ? new Date(Number(m.messageTimestamp) * 1000) : new Date()
      });
    }
    return out;
  },

  normalizarEstado(payload): ActualizacionEstado[] {
    const raw = payload as any;
    if (raw?.event !== "messages.update") return [];
    const data = raw?.data;
    const items = Array.isArray(data) ? data : [data];

    const out: ActualizacionEstado[] = [];
    for (const it of items ?? []) {
      const id = it?.key?.id ?? it?.keyId ?? it?.id;
      const status = mapStatusEvolution(it?.status ?? it?.update?.status);
      if (id && status) out.push({ waMessageId: id, status });
    }
    return out;
  },

  async descargarMedia(raw, instancia) {
    const { ok, data } = await req("POST", `/chat/getBase64FromMediaMessage/${instancia}`, { message: raw });
    if (!ok || !data?.base64) return null;
    return { base64: data.base64, mime: data.mimetype ?? data.mediaType ?? "application/octet-stream" };
  },

  async configurarWebhook(instancia, url, apiKey) {
    return post(`/webhook/set/${instancia}`, {
      webhook: {
        enabled: true,
        url,
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE"]
      }
    });
  },

  async obtenerDirectorio(instancia) {
    const contactos: ImportContacto[] = [];
    const chats: ImportChat[] = [];

    const rc = await req("POST", `/chat/findContacts/${instancia}`, {});
    const arrC = Array.isArray(rc.data) ? rc.data : rc.data?.records ?? rc.data?.contacts ?? [];
    for (const c of arrC) {
      const tel = jidIndividual(c?.remoteJid ?? c?.id ?? c?.jid ?? "");
      if (tel) contactos.push({ telefono: tel, nombre: c?.pushName ?? c?.name ?? undefined });
    }

    const rch = await req("POST", `/chat/findChats/${instancia}`, {});
    const arrCh = Array.isArray(rch.data) ? rch.data : rch.data?.records ?? rch.data?.chats ?? [];
    for (const ch of arrCh) {
      const tel = jidIndividual(ch?.remoteJid ?? ch?.id ?? ch?.jid ?? "");
      if (!tel) continue;
      const lm = ch?.lastMessage ?? ch?.lastMsg;
      const ultimoTexto =
        lm?.message?.conversation ?? lm?.message?.extendedTextMessage?.text ?? ch?.lastMessageText ?? undefined;
      const tsRaw = ch?.updatedAt ?? lm?.messageTimestamp ?? ch?.lastMessageTimestamp;
      let timestamp: Date | undefined;
      if (tsRaw != null) {
        const n = Number(tsRaw);
        timestamp = Number.isFinite(n) ? new Date(n > 1e12 ? n : n * 1000) : new Date(tsRaw);
        if (isNaN(timestamp.getTime())) timestamp = undefined;
      }
      chats.push({ telefono: tel, nombre: ch?.pushName ?? ch?.name ?? undefined, ultimoTexto, timestamp });
    }

    return { contactos, chats };
  },

  normalizarEntranteGrupo(payload): MensajeGrupoNormalizado[] {
    const raw = payload as any;
    if (raw?.event && raw.event !== "messages.upsert") return [];
    const data = raw?.data;
    if (!data) return [];
    const items = Array.isArray(data) ? data : [data];

    const out: MensajeGrupoNormalizado[] = [];
    for (const m of items) {
      if (m?.key?.fromMe) continue;
      const jid = m?.key?.remoteJid ?? "";
      if (!jid.includes("@g.us")) continue; // solo grupos
      const remitenteTel = (m?.key?.participant ?? "").split("@")[0].replace(/\D/g, "");
      const { tipo, contenido, mediaUrl, mediaMime } = extraerContenido(m?.message ?? {});
      out.push({
        grupoJid: jid,
        remitenteTel,
        remitenteNombre: m?.pushName,
        tipo,
        contenido,
        mediaUrl,
        mediaMime,
        raw: m,
        waMessageId: m?.key?.id ?? `${Date.now()}-${Math.random()}`,
        timestamp: m?.messageTimestamp ? new Date(Number(m.messageTimestamp) * 1000) : new Date()
      });
    }
    return out;
  },

  async infoGrupo(instancia, jid) {
    const { ok, data } = await req("GET", `/group/findGroupInfos/${instancia}?groupJid=${encodeURIComponent(jid)}`);
    if (!ok) return null;
    const g = Array.isArray(data) ? data[0] : data;
    return { nombre: g?.subject ?? undefined };
  },

  async obtenerMensajes(instancia, jid, limite = 5) {
    const { ok, data } = await req("POST", `/chat/findMessages/${instancia}`, { where: { key: { remoteJid: jid } } });
    if (!ok) return [];
    const recs: any[] = data?.messages?.records ?? data?.records ?? (Array.isArray(data) ? data : []);
    const ordenados = [...recs].sort((a, b) => Number(a?.messageTimestamp || 0) - Number(b?.messageTimestamp || 0));
    return ordenados.slice(-limite).map((m): MensajeHistorial => {
      const { tipo, contenido, mediaUrl, mediaMime } = extraerContenido(m?.message ?? {});
      return {
        direccion: (m?.key?.fromMe ? "saliente" : "entrante") as "saliente" | "entrante",
        tipo,
        contenido,
        mediaUrl,
        mediaMime,
        waMessageId: m?.key?.id ?? `${Date.now()}-${Math.random()}`,
        timestamp: m?.messageTimestamp ? new Date(Number(m.messageTimestamp) * 1000) : new Date(),
        remitenteNombre: m?.pushName,
        remitenteTel: (m?.key?.participant ?? "").split("@")[0].replace(/\D/g, "") || undefined
      };
    });
  },

  async listarGruposWA(instancia) {
    const { ok, data } = await req("GET", `/group/fetchAllGroups/${instancia}?getParticipants=false`);
    if (!ok) return [];
    const arr: any[] = Array.isArray(data) ? data : data?.records ?? [];
    return arr
      .map((g) => ({ jid: g?.id ?? g?.jid ?? "", nombre: g?.subject ?? String(g?.id ?? "").split("@")[0] }))
      .filter((g) => g.jid.includes("@g.us"));
  }
  };
}

/** Provider con la instancia global del env (compatibilidad / canal sin instancia propia). */
export const evolutionProvider: ChannelProvider = buildProvider(INSTANCE);

/** Provider atado a la instancia del canal; sin instancia cae a la global. */
export function makeEvolutionProvider(instancia?: string | null): ChannelProvider {
  const inst = instancia?.trim();
  return inst && inst !== INSTANCE ? buildProvider(inst) : evolutionProvider;
}

/** Devuelve los dígitos del número solo si el jid es de un chat individual (no grupos/estados). */
function jidIndividual(jid: string): string | null {
  if (!jid || !jid.includes("@s.whatsapp.net")) return null;
  const num = jid.split("@")[0].replace(/\D/g, "");
  return num || null;
}

/** Extrae tipo/contenido/media de un message de Baileys (sirve para individuales y grupos). */
function extraerContenido(msg: any): { tipo: TipoMensaje; contenido?: string; mediaUrl?: string; mediaMime?: string } {
  // WhatsApp envuelve algunos mensajes en un "sobre" (efímeros, ver una vez,
  // documento con caption): hay que abrirlo o el contenido se pierde como texto vacío.
  msg =
    msg?.ephemeralMessage?.message ??
    msg?.viewOnceMessage?.message ??
    msg?.viewOnceMessageV2?.message ??
    msg?.documentWithCaptionMessage?.message ??
    msg ?? {};
  if (msg.conversation || msg.extendedTextMessage) {
    return { tipo: "texto", contenido: msg.conversation ?? msg.extendedTextMessage?.text };
  }
  if (msg.stickerMessage) {
    // Los stickers son webp: se muestran como imagen.
    return { tipo: "imagen", mediaUrl: msg.stickerMessage.url, mediaMime: msg.stickerMessage.mimetype ?? "image/webp" };
  }
  if (msg.imageMessage) return { tipo: "imagen", contenido: msg.imageMessage.caption, mediaUrl: msg.imageMessage.url, mediaMime: msg.imageMessage.mimetype };
  if (msg.videoMessage) return { tipo: "video", contenido: msg.videoMessage.caption, mediaUrl: msg.videoMessage.url, mediaMime: msg.videoMessage.mimetype };
  if (msg.audioMessage) return { tipo: "audio", mediaUrl: msg.audioMessage.url, mediaMime: msg.audioMessage.mimetype };
  if (msg.documentMessage) return { tipo: "documento", contenido: msg.documentMessage.fileName, mediaUrl: msg.documentMessage.url, mediaMime: msg.documentMessage.mimetype };
  if (msg.locationMessage) return { tipo: "ubicacion", contenido: `${msg.locationMessage.degreesLatitude},${msg.locationMessage.degreesLongitude}` };
  return { tipo: "texto" };
}
