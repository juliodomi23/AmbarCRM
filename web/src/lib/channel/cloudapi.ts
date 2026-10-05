import type {
  ActualizacionEstado,
  ChannelProvider,
  MensajeEntranteNormalizado,
  PlantillaOficial,
  TipoMensaje
} from "./types";
import { META_GRAPH_URL } from "@/lib/meta/config";
import { tokenFromChannelConfig } from "@/lib/meta/credentials";

export interface CloudConfig extends Record<string, unknown> {
  token?: string;
  tokenEncrypted?: string;
  phoneNumberId?: string;
  wabaId?: string;
}

function credentials(config?: CloudConfig) {
  return {
    token: tokenFromChannelConfig(config),
    phoneId: String(config?.phoneNumberId || process.env.CLOUD_API_PHONE_NUMBER_ID || ""),
    wabaId: String(config?.wabaId || process.env.CLOUD_API_WABA_ID || "")
  };
}

function parseDataUri(value: string): { bytes: Buffer; mime: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(value);
  return match ? { mime: match[1], bytes: Buffer.from(match[2], "base64") } : null;
}

function digits(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function normalizeMessage(
  message: any,
  telefono: string,
  nombre?: string,
  direccion: "entrante" | "saliente" = "entrante",
  historico = false
): MensajeEntranteNormalizado | null {
  if (!message?.id || !telefono) return null;
  let tipo: TipoMensaje = "texto";
  let contenido: string | undefined;
  let mediaId: string | undefined;
  if (message.type === "text") contenido = message.text?.body;
  else if (message.type === "image") {
    tipo = "imagen";
    contenido = message.image?.caption;
    mediaId = message.image?.id;
  } else if (message.type === "video") {
    tipo = "video";
    contenido = message.video?.caption;
    mediaId = message.video?.id;
  } else if (message.type === "audio") {
    tipo = "audio";
    mediaId = message.audio?.id;
  } else if (message.type === "document") {
    tipo = "documento";
    contenido = message.document?.filename;
    mediaId = message.document?.id;
  } else if (message.type === "location") {
    tipo = "ubicacion";
    contenido = `${message.location?.latitude},${message.location?.longitude}`;
  } else return null;

  return {
    waMessageId: String(message.id),
    telefono: digits(telefono),
    nombre,
    tipo,
    contenido,
    mediaUrl: mediaId,
    raw: mediaId,
    direccion,
    historico,
    timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date()
  };
}

/** Extrae el historial inicial que Meta entrega al activar Coexistence. */
export function normalizarHistorialCoexistence(payload: unknown): MensajeEntranteNormalizado[] {
  const raw = payload as any;
  const output: MensajeEntranteNormalizado[] = [];
  for (const entry of raw?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const businessPhone = digits(value?.metadata?.display_phone_number);
      for (const history of value?.history || []) {
        for (const thread of history?.threads || []) {
          const threadPhone = digits(thread?.id || thread?.wa_id);
          const threadName = thread?.name || thread?.profile?.name;
          for (const message of thread?.messages || []) {
            const from = digits(message?.from);
            const to = digits(message?.to);
            const outgoing = Boolean(businessPhone && from === businessPhone);
            const contactPhone = outgoing ? (to || threadPhone) : (from || threadPhone);
            const normalized = normalizeMessage(
              message,
              contactPhone,
              threadName,
              outgoing ? "saliente" : "entrante",
              true
            );
            if (normalized) output.push(normalized);
          }
        }
      }
    }
  }
  return output;
}

export function makeCloudApiProvider(config?: CloudConfig): ChannelProvider {
  const { token, phoneId, wabaId } = credentials(config);

  async function graph(path: string, init?: RequestInit) {
    if (!token) throw new Error("canal de Meta sin credencial");
    const response = await fetch(`${META_GRAPH_URL}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `Meta HTTP ${response.status}`);
    return data;
  }

  async function send(payload: Record<string, unknown>) {
    if (!phoneId) return { ok: false, error: "canal de Meta sin phoneNumberId" };
    try {
      const data = await graph(`${phoneId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", ...payload })
      });
      return { ok: true, waMessageId: data?.messages?.[0]?.id };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "error de red" };
    }
  }

  async function uploadMedia(value: string, mime?: string): Promise<string | null> {
    if (!phoneId || !token) return null;
    const parsed = parseDataUri(value);
    if (!parsed) return null;
    const form = new FormData();
    form.set("messaging_product", "whatsapp");
    form.set("type", mime || parsed.mime);
    form.set("file", new Blob([Uint8Array.from(parsed.bytes)], { type: mime || parsed.mime }), "archivo");
    const data = await graph(`${phoneId}/media`, { method: "POST", body: form });
    return typeof data?.id === "string" ? data.id : null;
  }

  return {
    nombre: "cloud_api",

    async enviarTexto(telefono, texto) {
      return send({ to: telefono, type: "text", text: { body: texto } });
    },

    async enviarPlantilla(telefono, plantilla, variables = []) {
      const parameters = variables.map((text) => ({ type: "text", text }));
      return send({
        to: telefono,
        type: "template",
        template: {
          name: plantilla.name,
          language: { code: plantilla.language },
          ...(parameters.length ? { components: [{ type: "body", parameters }] } : {})
        }
      });
    },

    async listarPlantillas() {
      if (!wabaId) return [];
      try {
        const data = await graph(
          `${wabaId}/message_templates?fields=name,language,status,category,components&limit=100`
        );
        return (data?.data || []).map((item: any): PlantillaOficial => ({
          name: item.name,
          language: item.language,
          status: item.status,
          category: item.category,
          components: item.components
        }));
      } catch {
        return [];
      }
    },

    async enviarMedia(telefono, mediaValue, tipo: TipoMensaje, caption, mimetype) {
      const typeMap: Record<string, string> = {
        imagen: "image",
        video: "video",
        audio: "audio",
        documento: "document"
      };
      const type = typeMap[tipo] || "document";
      try {
        const mediaId = await uploadMedia(mediaValue, mimetype);
        const media = mediaId
          ? { id: mediaId, ...(caption && type !== "audio" ? { caption } : {}) }
          : { link: mediaValue, ...(caption && type !== "audio" ? { caption } : {}) };
        return send({ to: telefono, type, [type]: media });
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "no se pudo subir el archivo" };
      }
    },

    async enviarAudio(telefono, audioBase64) {
      const provider = makeCloudApiProvider(config);
      return provider.enviarMedia(
        telefono,
        `data:audio/ogg;base64,${audioBase64}`,
        "audio",
        undefined,
        "audio/ogg"
      );
    },

    async descargarMedia(raw: unknown) {
      const mediaId = typeof raw === "string" ? raw : (raw as { mediaId?: string })?.mediaId;
      if (!mediaId || !token) return null;
      try {
        const metadata = await graph(mediaId);
        if (!metadata?.url) return null;
        const response = await fetch(metadata.url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) return null;
        return {
          base64: Buffer.from(await response.arrayBuffer()).toString("base64"),
          mime: metadata.mime_type || "application/octet-stream"
        };
      } catch {
        return null;
      }
    },

    normalizarEntrante(payload) {
      const raw = payload as any;
      const output: MensajeEntranteNormalizado[] = [];
      for (const entry of raw?.entry || []) {
        for (const change of entry?.changes || []) {
          const value = change?.value || {};
          const contacts: Record<string, string> = {};
          for (const contact of value?.contacts || []) {
            contacts[contact.wa_id] = contact?.profile?.name;
          }
          for (const message of value?.messages || []) {
            const normalized = normalizeMessage(message, message.from, contacts[message.from]);
            if (normalized) output.push(normalized);
          }
          for (const message of value?.message_echoes || []) {
            const normalized = normalizeMessage(message, message.to, undefined, "saliente");
            if (normalized) output.push(normalized);
          }
        }
      }
      return output;
    },

    normalizarEstado(payload) {
      const output: ActualizacionEstado[] = [];
      const statusMap: Record<string, ActualizacionEstado["status"]> = {
        sent: "enviado",
        delivered: "entregado",
        read: "leido",
        failed: "fallido"
      };
      const raw = payload as any;
      for (const entry of raw?.entry || []) {
        for (const change of entry?.changes || []) {
          for (const status of change?.value?.statuses || []) {
            const normalized = statusMap[status.status];
            if (status.id && normalized) output.push({ waMessageId: status.id, status: normalized });
          }
        }
      }
      return output;
    }
  };
}

export const cloudApiProvider = makeCloudApiProvider();
