import { db } from "@/lib/db";
import { META_GRAPH_URL } from "@/lib/meta/config";
import { tokenFromChannelConfig } from "@/lib/meta/credentials";
import { destinoPublico } from "@/lib/webhook-url";
import type { ChannelProvider, ContextoEnvio, MensajeEntranteNormalizado, TipoMensaje } from "./types";

export const CAMPOS_MESSENGER = ["messages", "message_deliveries", "message_echoes", "message_reads", "standby", "messaging_handovers", "messaging_postbacks"];

export async function messengerGraph(config: Record<string, unknown>, path: string, init?: RequestInit) {
  const token = tokenFromChannelConfig(config);
  if (!token) throw new Error("Messenger sin token de página");
  const res = await fetch(`${META_GRAPH_URL}/${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers }, signal: AbortSignal.timeout(5000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw Object.assign(new Error(data.error?.message ?? `Meta HTTP ${res.status}`), { code: data.error?.code });
  return data;
}

export async function suscribirPagina(config: Record<string, unknown>) {
  const respuesta = await messengerGraph(config, `${config.pageId}/subscribed_apps`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscribed_fields: CAMPOS_MESSENGER }),
  });
  if (respuesta.success !== true) throw new Error("Meta no confirmó la suscripción de la página");
  return respuesta;
}

export async function perfilMessenger(config: Record<string, unknown>, psid: string) {
  try {
    const data = await messengerGraph(config, `${encodeURIComponent(psid)}?fields=first_name,last_name,profile_pic`);
    return { nombre: [data.first_name, data.last_name].filter(Boolean).join(" ") || undefined,
      avatarUrl: typeof data.profile_pic === "string" && data.profile_pic.startsWith("https://") ? data.profile_pic : undefined };
  } catch { return {}; }
}

export function tipoEnvioMessenger(contexto?: ContextoEnvio, ahora = Date.now()) {
  const ultimo = contexto?.ultimoEntranteAt?.getTime();
  if (ultimo == null || !Number.isFinite(ultimo) || ultimo > ahora + 60_000) return null;
  const edad = ahora - ultimo;
  if (edad < 24 * 60 * 60 * 1000) return { messaging_type: "RESPONSE" };
  if (contexto?.humano && edad < 7 * 24 * 60 * 60 * 1000) return { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" };
  return null;
}

export function normalizarMessenger(payload: unknown): MensajeEntranteNormalizado[] {
  const salida: MensajeEntranteNormalizado[] = [];
  const tipos: Record<string, TipoMensaje> = { image: "imagen", audio: "audio", video: "video", file: "documento" };
  for (const entry of (payload as any)?.entry ?? []) for (const evento of entry.messaging ?? []) {
    const m = evento.message;
    if (!m?.mid || (m.is_echo && m.app_id && String(m.app_id) === process.env.META_APP_ID)) continue;
    const psid = m.is_echo ? evento.recipient?.id : evento.sender?.id;
    if (!psid) continue;
    const adjuntos = (m.attachments ?? []).filter((a: any) => tipos[a.type] && typeof a.payload?.url === "string");
    const comunes = { identificadorExterno: String(psid), direccion: m.is_echo ? "saliente" as const : "entrante" as const,
      timestamp: new Date(Math.min(Number(evento.timestamp) || Date.now(), Date.now())) };
    if (!adjuntos.length && typeof m.text === "string") salida.push({ ...comunes, waMessageId: String(m.mid), tipo: "texto", contenido: m.text });
    for (let i = 0; i < adjuntos.length; i++) salida.push({ ...comunes,
      waMessageId: i === 0 ? String(m.mid) : `${m.mid}:adjunto:${i}`,
      tipo: tipos[adjuntos[i].type], contenido: i === 0 ? m.text : undefined, mediaUrl: adjuntos[i].payload.url,
    });
  }
  return salida;
}

export function makeMessengerProvider(config?: unknown): ChannelProvider {
  const datos = (config ?? {}) as Record<string, unknown>;
  async function enviar(destinatario: string, message: unknown, contexto?: ContextoEnvio) {
    const tipo = tipoEnvioMessenger(contexto);
    if (!tipo) return { ok: false, error: contexto?.humano
      ? "Ventana de Messenger cerrada: el asesor solo puede responder hasta 7 días desde el último mensaje entrante."
      : "Ventana de 24 h de Messenger cerrada: el bot no puede enviar mensajes." };
    try {
      const data = await messengerGraph(datos, "me/messages", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: destinatario }, message, ...tipo }) });
      if (!data.message_id) return { ok: false, error: "Meta no devolvió el identificador del mensaje" };
      return { ok: true, waMessageId: String(data.message_id) };
    } catch (e) {
      const error = e instanceof Error ? e.message : "error de red con Messenger";
      if ((e as { code?: number }).code === 190 || /session has been invalidated|error validating access token/i.test(error)) {
        await db.canalWhatsapp.updateMany({ where: { proveedor: "messenger", config: { path: ["pageId"], equals: String(datos.pageId) } },
          data: { estado: "desconectado", config: { ...datos, errorAutorizacion: "El token de la página venció o fue revocado. Vuelve a conectar Messenger." } as Record<string, string> } });
      }
      return { ok: false, error };
    }
  }
  return {
    nombre: "messenger",
    enviarTexto: (destinatario, texto, contexto) => enviar(destinatario, { text: texto }, contexto),
    async enviarMedia(destinatario, url, tipo, caption, _mime, contexto) {
      if (!url.startsWith("https://") || !(await destinoPublico(url))) return { ok: false, error: "Messenger requiere una URL pública https para el adjunto" };
      if (caption) { const texto = await enviar(destinatario, { text: caption }, contexto); if (!texto.ok) return texto; }
      const tipos: Record<string, string> = { imagen: "image", audio: "audio", video: "video", documento: "file" };
      return enviar(destinatario, { attachment: { type: tipos[tipo] ?? "file", payload: { url } } }, contexto);
    },
    normalizarEntrante: normalizarMessenger,
  };
}
