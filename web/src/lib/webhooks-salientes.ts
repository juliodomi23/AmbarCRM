import { db, runWithOrg } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { entregarWebhookApi } from "@/lib/api-webhook";
import { decryptMetaToken } from "@/lib/meta/credentials";
import type { DatosEvento, EventoCrm } from "@/lib/eventos-crm";

export const WEBHOOK_PUBLICO = {
  id: true, url: true, eventos: true, activo: true, creadoEn: true,
  ultimoEstado: true, ultimoError: true,
} as const;

export async function entregarEvento(
  orgId: bigint, evento: EventoCrm | "prueba", datos: DatosEvento,
  opciones: Parameters<typeof entregarWebhookApi>[3] = {}, webhookId?: bigint,
) {
  return runWithOrg(orgId, async () => {
    const webhooks = await db.webhookSaliente.findMany({ where: {
      activo: true, ...(webhookId ? { id: webhookId } : { eventos: { has: evento } }),
    } });
    return Promise.all(webhooks.map(async (webhook) => {
      let ok = false;
      try {
        if (!webhook.secreto.startsWith("encv1:")) throw new Error("cifrado inválido");
        const resultado = await entregarWebhookApi(webhook.url, decryptMetaToken(webhook.secreto), {
          evento, empresa: String(orgId), ocurrido_en: new Date().toISOString(), datos,
        }, opciones);
        ok = resultado.ok;
      } catch { /* La operación original ya fue confirmada. */ }
      await transaccionTenant(orgId, async (tx) => {
        await tx.$executeRaw`
          UPDATE webhook_saliente SET ultimo_estado = ${ok ? "ok" : "error"},
            ultimo_error = ${ok ? null : "No se pudo entregar el webhook"},
            fallos_seguidos = CASE WHEN ${ok} THEN 0 ELSE fallos_seguidos + 1 END,
            activo = CASE WHEN NOT ${ok} AND fallos_seguidos + 1 >= 20 THEN false ELSE activo END
          WHERE id = ${webhook.id}`;
      });
      return { id: String(webhook.id), ok };
    }));
  });
}

const pendientes = new Set<Promise<unknown>>();

export function emitirEvento(orgId: bigint, evento: EventoCrm, payload: DatosEvento) {
  const tarea = entregarEvento(orgId, evento, payload).catch(() => {});
  pendientes.add(tarea);
  void tarea.finally(() => pendientes.delete(tarea));
}

export async function esperarWebhooks() {
  await Promise.all([...pendientes]);
}
