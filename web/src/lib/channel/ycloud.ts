import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  ActualizacionEstado,
  ChannelProvider,
  MensajeEntranteNormalizado,
  ResultadoEnvio,
  TipoMensaje,
  PlantillaOficial
} from "./types";

const API = "https://api.ycloud.com/v2";

export interface YCloudConfig {
  apiKey?: string;
  webhookSecret?: string;
  phoneNumber?: string;
}

function e164(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits ? "+" + digits : "";
}

function configValue(config: YCloudConfig | undefined, key: keyof YCloudConfig, fallback: string): string {
  return String(config?.[key] || fallback || "");
}

export function verificarFirmaYCloud(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const values = Object.fromEntries(signature.split(",").map((part) => part.split("=", 2))) as Record<string, string>;
  const timestamp = values.t;
  const received = values.s;
  if (!timestamp || !received || !/^[0-9a-f]+$/i.test(received)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(timestamp + "." + body).digest("hex");
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(received, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function makeYCloudProvider(config?: YCloudConfig, businessNumber?: string): ChannelProvider {
  const apiKey = configValue(config, "apiKey", process.env.YCLOUD_API_KEY || "");
  const from = e164(configValue(config, "phoneNumber", businessNumber || process.env.YCLOUD_PHONE_NUMBER || ""));

  async function request(payload: Record<string, unknown>): Promise<ResultadoEnvio> {
    if (!apiKey) return { ok: false, error: "Falta YCLOUD_API_KEY" };
    if (!from) return { ok: false, error: "Falta el número de negocio YCloud" };
    try {
      const response = await fetch(API + "/whatsapp/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({ from, ...payload })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, error: data?.message || data?.error || "YCloud HTTP " + response.status };
      return {
        ok: true,
        waMessageId: data?.id || data?.whatsappMessage?.id || data?.whatsappMessage?.wamid
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "error de red" };
    }
  }

  async function uploadMedia(base64: string, mime: string): Promise<string | null> {
    if (!apiKey || !from) return null;
    try {
      const form = new FormData();
      form.append("file", new Blob([Buffer.from(base64, "base64")], { type: mime || "application/octet-stream" }), "media");
      const response = await fetch(API + "/whatsapp/media/" + encodeURIComponent(from) + "/upload", {
        method: "POST",
        headers: { "X-API-Key": apiKey },
        body: form
      });
      const data = await response.json().catch(() => ({}));
      return response.ok ? data?.id || null : null;
    } catch {
      return null;
    }
  }

  async function sendMedia(telefono: string, mediaUrl: string, tipo: TipoMensaje, caption?: string, mimetype?: string) {
    const mediaId = await uploadMedia(mediaUrl, mimetype || "application/octet-stream");
    if (!mediaId) return { ok: false, error: "No se pudo subir el multimedia a YCloud" };
    const field = ({ imagen: "image", video: "video", audio: "audio", documento: "document" } as Record<string, string>)[tipo] || "document";
    const media: Record<string, string> = { id: mediaId };
    if (caption) media.caption = caption;
    return request({ to: e164(telefono), type: field, [field]: media });
  }

  return {
    nombre: "ycloud",
    enviarTexto: (telefono, texto) => request({ to: e164(telefono), type: "text", text: { body: texto } }),
    enviarPlantilla: (telefono, plantilla, variables = []) => request({
      to: e164(telefono),
      type: "template",
      template: {
        name: plantilla.name,
        language: { code: plantilla.language },
        components: variables.length ? [{ type: "body", parameters: variables.map((text) => ({ type: "text", text })) }] : undefined
      }
    }),
    listarPlantillas: async (): Promise<PlantillaOficial[]> => {
      if (!apiKey) return [];
      try {
        const response = await fetch(API + "/whatsapp/templates?limit=100", { headers: { "X-API-Key": apiKey } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return [];
        return (data?.items || []).map((item: any) => ({
          name: String(item.name || ""),
          language: String(item.language || "en_US"),
          status: item.status,
          category: item.category,
          components: item.components
        })).filter((item: PlantillaOficial) => item.name);
      } catch {
        return [];
      }
    },
    enviarMedia: sendMedia,
    enviarAudio: (telefono, audioBase64) => sendMedia(telefono, audioBase64, "audio", undefined, "audio/ogg"),
    descargarMedia: async (raw) => {
      const media = raw as { link?: string; mime?: string };
      if (!media?.link || !apiKey) return null;
      try {
        const response = await fetch(media.link, { headers: { "X-API-Key": apiKey } });
        if (!response.ok) return null;
        return { base64: Buffer.from(await response.arrayBuffer()).toString("base64"), mime: media.mime || "application/octet-stream" };
      } catch {
        return null;
      }
    },
    normalizarEntrante(payload) {
      const raw = payload as any;
      if (raw?.type !== "whatsapp.inbound_message.received") return [];
      const message = raw?.whatsappInboundMessage;
      if (!message?.id && !message?.wamid) return [];
      const kind = message.type;
      let tipo: TipoMensaje = "texto";
      let contenido: string | undefined;
      let mediaUrl: string | undefined;
      let mediaMime: string | undefined;
      if (kind === "text") contenido = message.text?.body;
      else if (kind === "image") { tipo = "imagen"; contenido = message.image?.caption; mediaUrl = message.image?.link; mediaMime = message.image?.mime_type; }
      else if (kind === "video") { tipo = "video"; contenido = message.video?.caption; mediaUrl = message.video?.link; mediaMime = message.video?.mime_type; }
      else if (kind === "audio") { tipo = "audio"; mediaUrl = message.audio?.link; mediaMime = message.audio?.mime_type; }
      else if (kind === "document") { tipo = "documento"; contenido = message.document?.filename; mediaUrl = message.document?.link; mediaMime = message.document?.mime_type; }
      else if (kind === "location") { tipo = "ubicacion"; contenido = [message.location?.latitude, message.location?.longitude].join(","); }
      else if (kind === "button" || kind === "interactive") contenido = message.button?.text || message.button?.payload || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title;
      else contenido = "[" + String(kind || "mensaje") + "]";
      return [{
        waMessageId: String(message.wamid || message.id),
        telefono: String(message.from || "").replace(/\D/g, ""),
        nombre: message.customerProfile?.name,
        tipo,
        contenido,
        mediaUrl,
        mediaMime,
        raw: mediaUrl ? { link: mediaUrl, mime: mediaMime } : undefined,
        timestamp: message.sendTime ? new Date(message.sendTime) : new Date()
      }];
    },
    normalizarEstado(payload) {
      const raw = payload as any;
      if (raw?.type !== "whatsapp.message.updated") return [];
      const message = raw?.whatsappMessage;
      const map: Record<string, ActualizacionEstado["status"]> = {
        accepted: "enviado", sent: "enviado", delivered: "entregado", read: "leido", failed: "fallido"
      };
      const status = map[message?.status];
      return status && (message?.wamid || message?.id)
        ? [{ waMessageId: String(message.wamid || message.id), status }]
        : [];
    }
  };
}
