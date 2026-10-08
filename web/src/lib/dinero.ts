const MAXIMO = 9_999_999_999.99;

/** Monto con máximo 2 decimales (las columnas de dinero son Decimal(12,2) o mayores). Devuelve null si no es válido. */
export function dinero(valor: unknown, { permitirNegativo = false } = {}) {
  const texto = String(valor ?? "").trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(texto)) return null;
  const numero = Number(texto);
  if (Math.abs(numero) > MAXIMO) return null;
  if (!permitirNegativo && numero < 0) return null;
  return numero;
}
