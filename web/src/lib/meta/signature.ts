import { createHmac, timingSafeEqual } from "node:crypto";
import { decryptMetaToken } from "./credentials";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Firma X-Hub-Signature-256 de Meta. Por defecto con el App Secret global (la app de Tech Provider);
 * un canal conectado a mano con otra app de Meta pasa el App Secret de esa app.
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signature: string | null,
  appSecret = process.env.META_APP_SECRET?.trim()
): boolean {
  if (!appSecret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return safeEqual(signature, expected);
}

export function verificarFirmaInstagramCanal(config: Record<string, unknown>, raw: string, firma: string | null) {
  if (config.login === "instagram") return verifyMetaWebhookSignature(raw, firma, process.env.INSTAGRAM_APP_SECRET?.trim());
  if (config.appSecretEncrypted == null) return verifyMetaWebhookSignature(raw, firma);
  if (typeof config.appSecretEncrypted !== "string" || !config.appSecretEncrypted) return false;
  try { return verifyMetaWebhookSignature(raw, firma, decryptMetaToken(config.appSecretEncrypted)); }
  catch { return false; }
}
