// Reglas de Meta para el cuerpo de una plantilla con variables {{1}}, {{2}}…
// Si no se cumplen, Meta la rechaza automáticamente.

export function variablesDePlantilla(texto: string): number[] {
  const numeros = [...texto.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return [...new Set(numeros)].sort((a, b) => a - b);
}

export function errorDePlantilla(texto: string, ejemplos: string[]): string | null {
  const variables = variablesDePlantilla(texto);
  if (variables.some((n, i) => n !== i + 1)) {
    return "Las variables deben ir en orden: {{1}}, {{2}}, {{3}}…";
  }
  if (/^\s*\{\{\d+\}\}/.test(texto) || /\{\{\d+\}\}[\s.,;:!?¡¿]*$/.test(texto)) {
    return "El mensaje no puede empezar ni terminar con una variable. Agrega texto antes o después.";
  }
  if (variables.length > 0 && ejemplos.slice(0, variables.length).filter((e) => e?.trim()).length < variables.length) {
    return "Escribe un ejemplo para cada variable.";
  }
  return null;
}
