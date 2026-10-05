// Limitador simple en memoria por proceso.
// ponytail: si algún día corres varias instancias del CRM, mover el contador a Redis.
const hits = new Map<string, { n: number; reset: number }>();

/** Devuelve true si la acción se permite; false si superó `max` en la `ventanaMs`. */
export function permitido(clave: string, max: number, ventanaMs: number): boolean {
  const ahora = Date.now();
  const e = hits.get(clave);
  if (!e || ahora > e.reset) {
    hits.set(clave, { n: 1, reset: ahora + ventanaMs });
    return true;
  }
  if (e.n >= max) return false;
  e.n++;
  return true;
}
