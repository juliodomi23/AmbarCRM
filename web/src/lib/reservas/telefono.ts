/** Teléfono de México a 10 dígitos (acepta +52, 52 y 521). Null si no es válido. */
export function telefonoMx(valor: unknown): string | null {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (digitos.length === 10) return digitos;
  if (digitos.length === 12 && digitos.startsWith("52")) return digitos.slice(2);
  if (digitos.length === 13 && digitos.startsWith("521")) return digitos.slice(3);
  return null;
}

/**
 * Teléfono de contacto para guardar y buscar: solo dígitos; un número mexicano de 10 dígitos (o con
 * 52/521) se guarda como 52 + 10 dígitos (igual que Reservas en línea). `ultimos10` sirve para
 * buscar duplicados aunque el contacto haya llegado de WhatsApp como 521… o 52….
 * Null si no parece un teléfono (menos de 10 o más de 15 dígitos).
 */
export function telefonoContacto(valor: unknown): { completo: string; ultimos10: string } | null {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  const mx = telefonoMx(digitos);
  if (mx) return { completo: `52${mx}`, ultimos10: mx };
  if (digitos.length >= 10 && digitos.length <= 15) return { completo: digitos, ultimos10: digitos.slice(-10) };
  return null;
}
