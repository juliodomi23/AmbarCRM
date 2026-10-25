import { createHmac, timingSafeEqual } from "node:crypto";

function iguales(a: string, b: string) {
  const izquierda = Buffer.from(a, "utf8");
  const derecha = Buffer.from(b, "utf8");
  return (
    izquierda.length === derecha.length && timingSafeEqual(izquierda, derecha)
  );
}

export function firmaHmac(secret: string, contenido: string) {
  return createHmac("sha256", secret).update(contenido).digest("hex");
}

export function timestampReciente(
  valor: string,
  ahora = Date.now(),
  toleranciaMs = 5 * 60_000,
) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return false;
  const timestampMs = numero < 10_000_000_000 ? numero * 1000 : numero;
  return Math.abs(ahora - timestampMs) <= toleranciaMs;
}

export function verificarFirmaMercadoPago({
  signature,
  requestId,
  dataId,
  secret,
  ahora,
}: {
  signature: string;
  requestId: string;
  dataId: string;
  secret: string;
  ahora?: number;
}) {
  const partes = Object.fromEntries(
    signature.split(",").map((parte) => parte.trim().split("=", 2)),
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1 || !timestampReciente(ts, ahora)) return false;
  const manifest = `${dataId ? `id:${dataId};` : ""}${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
  return iguales(firmaHmac(secret, manifest), v1);
}

export function verificarFirmaMock({
  cuerpo,
  timestamp,
  firma,
  secret,
  ahora,
}: {
  cuerpo: string;
  timestamp: string;
  firma: string;
  secret: string;
  ahora?: number;
}) {
  return (
    timestampReciente(timestamp, ahora) &&
    iguales(firmaHmac(secret, `${timestamp}.${cuerpo}`), firma)
  );
}
