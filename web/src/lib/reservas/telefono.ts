/** Teléfono de México a 10 dígitos (acepta +52, 52 y 521). Null si no es válido. */
export function telefonoMx(valor: unknown): string | null {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (digitos.length === 10) return digitos;
  if (digitos.length === 12 && digitos.startsWith("52")) return digitos.slice(2);
  if (digitos.length === 13 && digitos.startsWith("521")) return digitos.slice(3);
  return null;
}
