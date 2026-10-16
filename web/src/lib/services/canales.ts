import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { hashClaveCanal } from "@/lib/canal-api-auth";
import { encryptMetaToken } from "@/lib/meta/credentials";
import { validarUrlCanalApi } from "@/lib/api-webhook";
import { destinoPublico } from "@/lib/webhook-url";
import { ErrorRetail } from "@/lib/retail-db";

export function credencialesApi() {
  const apiKey = randomBytes(32).toString("hex");
  const secret = randomBytes(32).toString("hex");
  return { apiKey, secret, config: { apiKeyHash: hashClaveCanal(apiKey), secretEncrypted: encryptMetaToken(secret) } };
}

export async function validarWebhookApi(webhookUrl: unknown) {
  if (typeof webhookUrl !== "string") throw new ErrorRetail("falta webhook_url");
  const error = validarUrlCanalApi(webhookUrl);
  if (error) throw new ErrorRetail(error);
  if (!(await destinoPublico(webhookUrl))) throw new ErrorRetail("el webhook debe resolver a una dirección pública");
  return webhookUrl.trim();
}

export async function crearCanalApi(nombre: string, webhookUrl: unknown) {
  if (!nombre.trim() || nombre.length > 150) throw new ErrorRetail("nombre inválido");
  const url = await validarWebhookApi(webhookUrl);
  const { apiKey, secret, config } = credencialesApi();
  const canal = await db.canalWhatsapp.create({ data: {
    nombre: nombre.trim(), proveedor: "api", estado: "conectado", config: { ...config, webhookUrl: url },
  } });
  return { id: String(canal.id), nombre: canal.nombre, apiKey, secret };
}

export async function editarCanalApi(id: bigint, body: Record<string, unknown>) {
  const canal = await db.canalWhatsapp.findFirst({ where: { id, proveedor: "api" } });
  if (!canal) throw new ErrorRetail("canal inexistente", 404);
  const config = { ...(canal.config as Record<string, unknown>) };
  const nombre = body.nombre == null ? canal.nombre : String(body.nombre).trim();
  if (!nombre || nombre.length > 150) throw new ErrorRetail("nombre inválido");
  if ("webhook_url" in body) config.webhookUrl = await validarWebhookApi(body.webhook_url);
  const nuevas = body.regenerar === true ? credencialesApi() : null;
  if (nuevas) Object.assign(config, nuevas.config);
  await db.canalWhatsapp.update({ where: { id }, data: { nombre, config: config as Record<string, string>, estado: "conectado" } });
  return { ok: true, ...(nuevas ? { apiKey: nuevas.apiKey, secret: nuevas.secret } : {}) };
}
