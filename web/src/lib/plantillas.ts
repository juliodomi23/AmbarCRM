/** Sustituye {{nombre}}, {{nombre_completo}} y {{telefono}} en una plantilla.
 *  Compartido por el chat (cliente) y las automatizaciones (servidor). */
export function aplicarVariables(
  texto: string,
  contacto: { nombre: string; telefono?: string | null }
): string {
  const primerNombre = contacto.nombre.trim().split(/\s+/)[0] || contacto.nombre;
  return texto
    .replace(/\{\{\s*nombre_completo\s*\}\}/gi, contacto.nombre)
    .replace(/\{\{\s*nombre\s*\}\}/gi, primerNombre)
    .replace(/\{\{\s*telefono\s*\}\}/gi, contacto.telefono ?? "");
}
