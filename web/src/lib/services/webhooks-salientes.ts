import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { encryptMetaToken } from "@/lib/meta/credentials";
import { ErrorRetail, transaccionTenant } from "@/lib/retail-db";
import { validarUrlCanalApi } from "@/lib/api-webhook";
import { EVENTOS_CRM } from "@/lib/eventos-crm";
import { objetoEstricto } from "@/lib/integraciones-api";
import { WEBHOOK_PUBLICO } from "@/lib/webhooks-salientes";

export function validarWebhookSaliente(body: unknown, parcial = false) {
  const b = objetoEstricto(body, ["url", "eventos", "activo"]);
  const data: { url?: string; eventos?: string[]; activo?: boolean } = {};
  if (!parcial || "url" in b) {
    if (typeof b.url !== "string" || b.url.length > 2048 || validarUrlCanalApi(b.url)) throw new ErrorRetail("URL HTTPS pública inválida");
    data.url = b.url.trim();
  }
  if (!parcial || "eventos" in b) {
    if (!Array.isArray(b.eventos) || !b.eventos.length || b.eventos.length > 5 ||
      b.eventos.some((e) => typeof e !== "string" || !(EVENTOS_CRM as readonly string[]).includes(e))) throw new ErrorRetail("eventos inválidos");
    data.eventos = [...new Set(b.eventos as string[])];
  }
  if ("activo" in b) {
    if (typeof b.activo !== "boolean") throw new ErrorRetail("activo inválido");
    data.activo = b.activo;
  }
  if (!Object.keys(data).length) throw new ErrorRetail("nada que actualizar");
  return data;
}

export function listarWebhooks() {
  return db.webhookSaliente.findMany({ select: WEBHOOK_PUBLICO, orderBy: { id: "asc" } });
}

export async function crearWebhookSaliente(orgId: bigint, body: unknown) {
  const data = validarWebhookSaliente(body);
  const secreto = randomBytes(32).toString("hex");
  const webhook = await transaccionTenant(orgId, async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'webhooks:' + orgId}, 0))`;
    if (await tx.webhookSaliente.count() >= 10) throw new ErrorRetail("máximo 10 webhooks por empresa", 409);
    return tx.webhookSaliente.create({ data: { url: data.url!, eventos: data.eventos!, activo: data.activo,
      secreto: encryptMetaToken(secreto) }, select: WEBHOOK_PUBLICO });
  });
  return { ...webhook, secreto };
}

export async function editarWebhookSaliente(id: bigint, body: unknown) {
  const data = validarWebhookSaliente(body, true);
  return db.webhookSaliente.update({ where: { id }, data: { ...data,
    ...(data.activo === true ? { fallosSeguidos: 0 } : {}),
  }, select: WEBHOOK_PUBLICO });
}
