/** Empresa dueña según el nombre del archivo (o123-…), o null si es antiguo, sin prefijo. */
export function orgDeArchivo(nombre: string): bigint | null {
  const m = nombre.split(/[\/]/).pop()?.match(/^o(\d+)-/);
  return m ? BigInt(m[1]) : null;
}
