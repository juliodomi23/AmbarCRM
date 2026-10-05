import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "encv1";

function encryptionKey(): Buffer {
  const encoded = process.env.META_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new Error("META_TOKEN_ENCRYPTION_KEY sin configurar");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("META_TOKEN_ENCRYPTION_KEY debe ser una clave Base64 de 32 bytes");
  }
  return key;
}

export function encryptMetaToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptMetaToken(value: string): string {
  if (!value.startsWith(`${PREFIX}:`)) return value;
  const parts = value.split(":");
  if (parts.length !== 4) throw new Error("credencial Meta cifrada inválida");
  const [, ivEncoded, tagEncoded, encryptedEncoded] = parts;
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedEncoded, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function tokenFromChannelConfig(config?: Record<string, unknown>): string {
  const encrypted = typeof config?.tokenEncrypted === "string" ? config.tokenEncrypted : "";
  if (encrypted) return decryptMetaToken(encrypted);

  // Compatibilidad temporal con canales creados por la implementación anterior.
  // Al reconectarlos mediante Embedded Signup se guardarán cifrados automáticamente.
  const legacy = typeof config?.token === "string" ? config.token : "";
  return legacy;
}
