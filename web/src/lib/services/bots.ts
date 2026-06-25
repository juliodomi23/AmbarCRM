import crypto from "crypto";
import { db } from "@/lib/db";

const BASE = process.env.NEXTAUTH_URL ?? "";

export function generarToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function listarBots() {
  return db.bot.findMany({ orderBy: { id: "asc" }, include: { canal: true } });
}

/** Bot activo aplicable a un canal: prioriza el específico del canal, si no, el global (canalId null). */
export async function botParaCanal(canalId: bigint | null) {
  const bots = await db.bot.findMany({ where: { activo: true } });
  if (bots.length === 0) return null;
  const especifico = canalId != null ? bots.find((b) => b.canalId === canalId) : undefined;
  return especifico ?? bots.find((b) => b.canalId === null) ?? null;
}

function absoluto(url: string) {
  return url.startsWith("http") ? url : `${BASE}${url}`;
}

type DatosDispatch = {
  conversacionId: bigint;
  contactoId: bigint;
  telefono: string;
  nombre: string;
  botActivo: boolean;
  mensaje: { id: bigint; tipo: string; contenido: string | null; mediaUrl: string | null };
};

/**
 * Manda el mensaje entrante al webhook del bot con un payload estilo Chatwoot `message_created`.
 * Así un workflow de n8n hecho para Chatwoot funciona cambiando solo el nodo de configuración.
 */
export async function dispatchABot(bot: { webhookUrl: string }, d: DatosDispatch) {
  const sender = { identifier: d.telefono, name: d.nombre, phone_number: `+${d.telefono}` };
  const attachments =
    d.mensaje.mediaUrl && d.mensaje.tipo !== "texto"
      ? [{ file_type: d.mensaje.tipo, data_url: absoluto(d.mensaje.mediaUrl) }]
      : [];

  const payload = {
    event: "message_created",
    message_type: "incoming",
    id: d.mensaje.id.toString(),
    content: d.mensaje.contenido ?? "",
    created_at: new Date().toISOString(),
    conversation: {
      id: Number(d.conversacionId),
      status: "open",
      labels: d.botActivo ? [] : ["bot_off"],
      meta: { sender }
    },
    sender,
    attachments,
    account: { id: 1 },
    // Atajos propios de AmbarCRM (no-Chatwoot) por si el flujo es nuevo:
    ambarcrm: {
      conversacionId: d.conversacionId.toString(),
      contactoId: d.contactoId.toString(),
      telefono: d.telefono,
      nombre: d.nombre,
      responder_url: `${BASE}/api/v1/accounts/1/conversations/${d.conversacionId}/messages`,
      handoff_url: `${BASE}/api/v1/accounts/1/conversations/${d.conversacionId}/labels`,
      funnel_url: `${BASE}/api/v1/accounts/1/conversations/${d.conversacionId}/funnel`
    }
  };

  // 2 intentos: si n8n tiene un hipo, reintenta una vez antes de rendirse.
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(bot.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
      clearTimeout(t);
      if (res.ok) return;
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.error(`dispatch a bot falló (intento ${intento}, conv ${d.conversacionId}):`, e instanceof Error ? e.message : e);
      if (intento < 2) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // Tras los reintentos: deja una nota interna VISIBLE en el chat para que el agente
  // responda a mano (en vez de perder el lead en silencio).
  await db.mensaje.create({
    data: {
      conversacionId: d.conversacionId,
      direccion: "saliente",
      tipo: "texto",
      interna: true,
      status: "enviado",
      contenido: "Aviso del sistema: el bot no recibió este mensaje (n8n no respondió). Responde manualmente."
    }
  }).catch(() => {});
}
