/** Patrón para LIKE/ILIKE que busca `texto` en cualquier parte, con \, % y _ tratados como texto. */
export function patronLike(texto: string) {
  const escapado = texto.replace(/[\\%_]/g, (caracter) => "\\" + caracter);
  return "%" + escapado + "%";
}
