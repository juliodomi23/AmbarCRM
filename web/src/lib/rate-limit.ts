// Limitador simple en memoria por proceso.
// ponytail: si algún día corres varias instancias del CRM, mover el contador a Redis.
const hits = new Map<string, { n: number; reset: number }>();
const MAX_CLAVES = 10_000;

/** Devuelve true si la acción se permite; false si superó `max` en la `ventanaMs`. */
export function permitido(clave: string, max: number, ventanaMs: number): boolean {
  const ahora = Date.now();
  // Las claves llevan datos que escribe el usuario (correos): sin limpieza, la memoria crece sin fin.
  if (hits.size > MAX_CLAVES) {
    for (const [k, v] of hits) if (ahora > v.reset) hits.delete(k);
  }
  const e = hits.get(clave);
  if (!e || ahora > e.reset) {
    hits.set(clave, { n: 1, reset: ahora + ventanaMs });
    return true;
  }
  if (e.n >= max) return false;
  e.n++;
  return true;
}

/** IP que escribió el proxy confiable. Solo sirve para limitar intentos, no para autorizar. */
export function ipCliente(headers: Record<string, string | string[] | undefined> | undefined) {
  const configurado = (process.env.IP_HEADER ?? "x-real-ip").trim().toLowerCase();
  const nombre = /^[a-z0-9-]+$/.test(configurado) ? configurado : "x-real-ip";
  const valor = headers?.[nombre];
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() || "desconocida";
}
