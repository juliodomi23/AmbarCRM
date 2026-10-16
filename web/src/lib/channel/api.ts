import { entregarWebhookApi } from "@/lib/api-webhook";
import { decryptMetaToken } from "@/lib/meta/credentials";
import type { ChannelProvider, ContextoEnvio } from "./types";

export function makeApiProvider(config?: unknown): ChannelProvider {
  const datos = (config ?? {}) as Record<string, unknown>;
  async function enviar(destinatario: string, content: string | undefined, attachments: unknown[], contexto?: ContextoEnvio) {
    if (typeof datos.webhookUrl !== "string" || typeof datos.secretEncrypted !== "string") {
      return { ok: false, error: "canal API sin webhook o secreto de firma" };
    }
    try {
      return await entregarWebhookApi(datos.webhookUrl, decryptMetaToken(datos.secretEncrypted), {
        event: "message_created", message_type: "outgoing", content: content ?? "",
        conversation: { id: contexto?.conversacionId?.toString() ?? null },
        receiver: { identifier: destinatario }, attachments, account: { id: 1 },
      });
    } catch { return { ok: false, error: "no se pudo descifrar el secreto del canal API" }; }
  }
  return {
    nombre: "api",
    enviarTexto: (destinatario, texto, contexto) => enviar(destinatario, texto, [], contexto),
    enviarMedia: (destinatario, url, tipo, caption, _mime, contexto) => enviar(destinatario, caption, [{ file_type: tipo, data_url: url }], contexto),
    normalizarEntrante: () => [],
  };
}
