import type { ChannelProvider, MensajeEntranteNormalizado, TipoMensaje } from "./types";

// WhatsApp Cloud API (coexistencia oficial de Meta), multi-tenant.
// Las credenciales viven en `canales_whatsapp.config` por cada cliente:
//   { token, phoneNumberId, wabaId }
// Con fallback a variables de entorno (modo un-solo-número / dev).

const GRAPH = "https://graph.facebook.com/v21.0";

export interface CloudConfig {
  token?: string;
  phoneNumberId?: string;
  wabaId?: string;
}

function credenciales(config?: CloudConfig) {
  const token = config?.token || process.env.CLOUD_API_TOKEN || "";
  const phoneId = config?.phoneNumberId || process.env.CLOUD_API_PHONE_NUMBER_ID || "";
  return { token, phoneId };
}

/** Crea un provider Cloud API atado a las credenciales de UN canal/org. */
export function makeCloudApiProvider(config?: CloudConfig): ChannelProvider {
  const { token, phoneId } = credenciales(config);

  async function send(payload: Record<string, unknown>) {
    try {
      const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messaging_product: "whatsapp", ...payload })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data?.error?.message ?? `HTTP ${res.status}` };
      return { ok: true, waMessageId: data?.messages?.[0]?.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "error de red" };
    }
  }

  return {
    nombre: "cloud_api",

    async enviarTexto(telefono, texto) {
      return send({ to: telefono, type: "text", text: { body: texto } });
    },

    async enviarMedia(telefono, mediaUrl, tipo: TipoMensaje, caption, _mimetype?: string) {
      const map: Record<string, string> = {
        imagen: "image", video: "video", audio: "audio", documento: "document"
      };
      const t = map[tipo] ?? "document";
      return send({ to: telefono, type: t, [t]: { link: mediaUrl, caption } });
    },

    // El media de Cloud API llega como media_id: hay que pedir la URL temporal y descargarla
    // autenticado con el token. `raw` trae el media_id (lo pone normalizarEntrante).
    async descargarMedia(raw: unknown) {
      const mediaId = typeof raw === "string" ? raw : (raw as { mediaId?: string })?.mediaId;
      if (!mediaId || !token) return null;
      try {
        const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
        const metaData = await meta.json().catch(() => ({}));
        const url: string | undefined = metaData?.url;
        const mime: string = metaData?.mime_type ?? "application/octet-stream";
        if (!url) return null;
        const bin = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!bin.ok) return null;
        const base64 = Buffer.from(await bin.arrayBuffer()).toString("base64");
        return { base64, mime };
      } catch {
        return null;
      }
    },

    normalizarEntrante(payload) {
      // Estructura webhook Cloud API: entry[].changes[].value.messages[]
      const raw = payload as any;
      const out: MensajeEntranteNormalizado[] = [];
      for (const entry of raw?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
          const value = change?.value ?? {};
          const contactos: Record<string, string> = {};
          for (const c of value?.contacts ?? []) contactos[c.wa_id] = c?.profile?.name;
          for (const m of value?.messages ?? []) {
            let tipo: TipoMensaje = "texto";
            let contenido: string | undefined;
            let mediaId: string | undefined;
            if (m.type === "text") contenido = m.text?.body;
            else if (m.type === "image") { tipo = "imagen"; contenido = m.image?.caption; mediaId = m.image?.id; }
            else if (m.type === "video") { tipo = "video"; contenido = m.video?.caption; mediaId = m.video?.id; }
            else if (m.type === "audio") { tipo = "audio"; mediaId = m.audio?.id; }
            else if (m.type === "document") { tipo = "documento"; contenido = m.document?.filename; mediaId = m.document?.id; }
            else if (m.type === "location") { tipo = "ubicacion"; contenido = `${m.location?.latitude},${m.location?.longitude}`; }

            out.push({
              waMessageId: m.id,
              telefono: m.from,
              nombre: contactos[m.from],
              tipo,
              contenido,
              mediaUrl: mediaId,   // id; ingest lo reemplaza por la URL local tras descargarMedia
              raw: mediaId,        // descargarMedia usa esto como media_id
              timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date()
            });
          }
        }
      }
      return out;
    }
  };
}

// Provider por defecto (credenciales de entorno) para usos sin canal explícito.
export const cloudApiProvider = makeCloudApiProvider();
