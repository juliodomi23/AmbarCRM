/** Convierte un parámetro de ruta/entrada a BigInt validando que sea numérico. Devuelve null si no lo es. */
export function aBigInt(valor: string | null | undefined): bigint | null {
  return valor != null && /^\d+$/.test(valor) ? BigInt(valor) : null;
}
