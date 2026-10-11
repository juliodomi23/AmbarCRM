// Ayudas para las pantallas de giro: filas del almacén con la forma que arman los page.tsx (fechas como Date).
export const fecha = (iso: string | null | undefined) => (iso ? new Date(iso) : null);
/** Copia la fila convirtiendo a Date las columnas de fecha indicadas. */
export function conFechas(fila: Record<string, any>, ...columnas: string[]): any {
  const copia: Record<string, any> = { ...fila };
  for (const c of columnas) copia[c] = fecha(fila[c]);
  return copia;
}
export const suma = (lista: Array<Record<string, any>>, campo: string) => lista.reduce((s, x) => s + (Number(x[campo]) || 0), 0);
