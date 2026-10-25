import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIJO = "encv1";

function llaveCifrado() {
  const codificada = process.env.PAGOS_TOKEN_ENCRYPTION_KEY?.trim();
  if (!codificada)
    throw new Error("PAGOS_TOKEN_ENCRYPTION_KEY sin configurar");
  const llave = Buffer.from(codificada, "base64");
  if (llave.length !== 32)
    throw new Error(
      "PAGOS_TOKEN_ENCRYPTION_KEY debe ser una clave Base64 de 32 bytes",
    );
  return llave;
}

export function cifrarCredencialPago(valor: string) {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", llaveCifrado(), iv);
  const cifrado = Buffer.concat([
    cifrador.update(valor, "utf8"),
    cifrador.final(),
  ]);
  return [
    PREFIJO,
    iv.toString("base64url"),
    cifrador.getAuthTag().toString("base64url"),
    cifrado.toString("base64url"),
  ].join(":");
}

export function descifrarCredencialPago(valor: string) {
  const partes = valor.split(":");
  if (partes.length !== 4 || partes[0] !== PREFIJO)
    throw new Error("credencial de pagos cifrada inválida");
  const descifrador = createDecipheriv(
    "aes-256-gcm",
    llaveCifrado(),
    Buffer.from(partes[1], "base64url"),
  );
  descifrador.setAuthTag(Buffer.from(partes[2], "base64url"));
  return Buffer.concat([
    descifrador.update(Buffer.from(partes[3], "base64url")),
    descifrador.final(),
  ]).toString("utf8");
}
