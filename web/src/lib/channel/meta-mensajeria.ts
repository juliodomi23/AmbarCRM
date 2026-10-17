import { db } from "@/lib/db";
import { META_GRAPH_URL } from "@/lib/meta/config";
import { tokenFromChannelConfig } from "@/lib/meta/credentials";
import { destinoPublico } from "@/lib/webhook-url";
import type { ChannelProvider, ContextoEnvio, MensajeEntranteNormalizado, TipoMensaje } from "./types";

export async function graphMensajeriaMeta(config: Record<string, unknown>, path: string, init?: RequestInit) {
  const token = tokenFromChannelConfig(config);
  if (!token) throw new Error("Messenger sin token de página");
  const res = await fetch(`${META_GRAPH_URL}/${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers }, signal: AbortSignal.timeout(5000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw Object.assign(new Error(data.error?.message ?? `Meta HTTP ${res.status}`), {
    code: data.error?.code, httpStatus: res.status,
  });
  return data;
}

export async function suscribirPaginaMeta(config: Record<string, unknown>, campos: string[]) {
  const respuesta = await graphMensajeriaMeta(config, `${config.pageId}/subscribed_apps`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscribed_fields: campos }),
  });
  if (respuesta.success !== true) throw new Error("Meta no confirmó la suscripción de la página");
  return respuesta;
}

export const ERROR_DESCONEXION_MESSENGER = "No se pudo cancelar la suscripción en Facebook. El canal se conservó; vuelve a intentarlo.";

export async function desuscribirPaginaMeta(config: Record<string, unknown>): Promise<{ desuscrito: boolean; motivo?: string }> {
  if (typeof config.pageId !== "string" || !/^\d{1,40}$/.test(config.pageId)) throw new Error(ERROR_DESCONEXION_MESSENGER);
  try {
    const respuesta = await graphMensajeriaMeta(config, `${config.pageId}/subscribed_apps`, { method: "DELETE" });
    if (respuesta.success !== true) throw new Error(ERROR_DESCONEXION_MESSENGER);
    return { desuscrito: true };
  } catch (error) {
    const datos = error as { code?: number; httpStatus?: number };
    if (datos.httpStatus == null || datos.httpStatus === 429 || datos.httpStatus >= 500) throw new Error(ERROR_DESCONEXION_MESSENGER);
    if (datos.code === 190 || (error instanceof Error && /session has been invalidated|error validating access token/i.test(error.message))) {
      return { desuscrito: false, motivo: "El token de la página venció o fue revocado; se retiró el canal local." };
    }
    if (datos.httpStatus === 404 || datos.code === 803) {
      return { desuscrito: false, motivo: "La página ya no está disponible en Facebook; se retiró el canal local." };
    }
    throw new Error(ERROR_DESCONEXION_MESSENGER);
  }
}

export async function perfilPaginaMeta(config: Record<string, unknown>, psid: string) {
  try {
    const data = await graphMensajeriaMeta(config, `${encodeURIComponent(psid)}?fields=first_name,last_name,profile_pic`);
    return { nombre: [data.first_name, data.last_name].filter(Boolean).join(" ") || undefined,
      avatarUrl: typeof data.profile_pic === "string" && data.profile_pic.startsWith("https://") ? data.profile_pic : undefined };
  } catch { return {}; }
}

export function tipoEnvioMeta(contexto?: ContextoEnvio, ahora = Date.now()) {
  const ultimo = contexto?.ultimoEntranteAt?.getTime();
  if (ultimo == null || !Number.isFinite(ultimo) || ultimo > ahora + 60_000) return null;
  const edad = ahora - ultimo;
  if (edad < 24 * 60 * 60 * 1000) return { messaging_type: "RESPONSE" };
  if (contexto?.humano && edad < 7 * 24 * 60 * 60 * 1000) return { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" };
  return null;
}

export function normalizarMensajeriaMeta(payload: unknown, appId?: string): MensajeEntranteNormalizado[] {
  const salida: MensajeEntranteNormalizado[] = [];
  const tipos: Record<string, TipoMensaje> = { image: "imagen", audio: "audio", video: "video", file: "documento" };
  for (const entry of (payload as any)?.entry ?? []) for (const evento of entry.messaging ?? []) {
    const m = evento.message;
    if (!m?.mid || (m.is_echo && m.app_id && String(m.app_id) === appId)) continue;
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

export function makeMensajeriaMetaProvider(config?: unknown, opciones: {
  proveedor?: "messenger" | "instagram";
  normalizar?: (payload: unknown, appId?: string) => MensajeEntranteNormalizado[];
  maxTexto?: number;
} = {}): ChannelProvider {
  const datos = (config ?? {}) as Record<string, unknown>;
  const proveedor = opciones.proveedor ?? "messenger";
  const nombre = proveedor === "instagram" ? "Instagram" : "Messenger";
  async function enviar(destinatario: string, message: unknown, contexto?: ContextoEnvio) {
    const texto = (message as { text?: unknown }).text;
    if (opciones.maxTexto && typeof texto === "string" && texto.length > opciones.maxTexto) {
      return { ok: false, error: `${nombre} admite hasta ${opciones.maxTexto} caracteres por mensaje` };
    }
    const tipo = tipoEnvioMeta(contexto);
    if (!tipo) return { ok: false, error: contexto?.humano
      ? `Ventana de ${nombre} cerrada: el asesor solo puede responder hasta 7 días desde el último mensaje entrante.`
      : `Ventana de 24 h de ${nombre} cerrada: el bot no puede enviar mensajes.` };
    try {
      const data = await graphMensajeriaMeta(datos, "me/messages", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: destinatario }, message, ...tipo }) });
      if (!data.message_id) return { ok: false, error: "Meta no devolvió el identificador del mensaje" };
      return { ok: true, waMessageId: String(data.message_id) };
    } catch (e) {
      const error = e instanceof Error ? e.message : "error de red con Messenger";
      const status = (e as { httpStatus?: number }).httpStatus;
      const definitivo = proveedor === "messenger" || (status != null && status < 500 && status !== 429);
      if (definitivo && ((e as { code?: number }).code === 190 || /session has been invalidated|error validating access token/i.test(error))) {
        await db.canalWhatsapp.updateMany({ where: { proveedor, config: { path: [proveedor === "instagram" ? "instagramId" : "pageId"], equals: String(proveedor === "instagram" ? datos.instagramId : datos.pageId) } },
          data: { estado: "desconectado", config: { ...datos, errorAutorizacion: `El token de la página venció o fue revocado. Vuelve a conectar ${nombre}.` } as Record<string, string> } });
      }
      return { ok: false, error: proveedor === "instagram" ? "No se pudo enviar el mensaje de Instagram" : error };
    }
  }
  return {
    nombre: proveedor,
    enviarTexto: (destinatario, texto, contexto) => enviar(destinatario, { text: texto }, contexto),
    async enviarMedia(destinatario, url, tipo, caption, _mime, contexto) {
      if (!url.startsWith("https://") || !(await destinoPublico(url))) return { ok: false, error: `${nombre} requiere una URL pública https para el adjunto` };
      if (caption) { const texto = await enviar(destinatario, { text: caption }, contexto); if (!texto.ok) return texto; }
      const tipos: Record<string, string> = { imagen: "image", audio: "audio", video: "video", documento: "file" };
      return enviar(destinatario, { attachment: { type: tipos[tipo] ?? "file", payload: { url } } }, contexto);
    },
    normalizarEntrante: (payload) => (opciones.normalizar ?? normalizarMensajeriaMeta)(payload, typeof datos.appId === "string" ? datos.appId : process.env.META_APP_ID?.trim()),
  };
}
