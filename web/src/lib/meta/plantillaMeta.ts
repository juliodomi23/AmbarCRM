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

// ---- Botones (sin variables: se envían igual a todos los clientes) ----
export type BotonPlantilla =
  | { tipo: "QUICK_REPLY"; texto: string }
  | { tipo: "URL"; texto: string; url: string }
  | { tipo: "PHONE_NUMBER"; texto: string; telefono: string };

// ponytail: 3 botones cubren los casos comunes; Meta permite hasta 10 si algún cliente lo pide.
export const MAX_BOTONES = 3;

/** Normaliza lo que llega del navegador: descarta tipos desconocidos y campos extra. */
export function leerBotones(raw: unknown): BotonPlantilla[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((b): BotonPlantilla[] => {
    const texto = String(b?.texto ?? "").trim();
    if (b?.tipo === "QUICK_REPLY") return [{ tipo: "QUICK_REPLY", texto }];
    if (b?.tipo === "URL") return [{ tipo: "URL", texto, url: String(b.url ?? "").trim() }];
    if (b?.tipo === "PHONE_NUMBER") return [{ tipo: "PHONE_NUMBER", texto, telefono: String(b.telefono ?? "").replace(/[\s-]/g, "") }];
    return [];
  });
}

export function errorDeBotones(botones: BotonPlantilla[]): string | null {
  if (botones.length > MAX_BOTONES) return `Máximo ${MAX_BOTONES} botones.`;
  for (const b of botones) {
    if (!b.texto || b.texto.length > 25) return "Cada botón necesita un texto de 1 a 25 caracteres.";
    if (b.tipo === "URL" && !/^https:\/\/[^\s{}]+\.[^\s{}]+$/i.test(b.url)) {
      return "El enlace del botón debe empezar con https:// y no llevar variables.";
    }
    if (b.tipo === "PHONE_NUMBER" && !/^\+\d{8,15}$/.test(b.telefono)) {
      return "El teléfono del botón va con lada internacional, por ejemplo +529611234567.";
    }
  }
  if (botones.filter((b) => b.tipo === "PHONE_NUMBER").length > 1) return "Solo puede haber un botón de llamada.";
  return null;
}

/** Componente BUTTONS para la API de Meta. Las respuestas rápidas van juntas, como pide Meta. */
export function componenteBotones(botones: BotonPlantilla[]) {
  if (botones.length === 0) return null;
  const ordenados = [...botones.filter((b) => b.tipo === "QUICK_REPLY"), ...botones.filter((b) => b.tipo !== "QUICK_REPLY")];
  return {
    type: "BUTTONS",
    buttons: ordenados.map((b) =>
      b.tipo === "QUICK_REPLY"
        ? { type: "QUICK_REPLY", text: b.texto }
        : b.tipo === "URL"
          ? { type: "URL", text: b.texto, url: b.url }
          : { type: "PHONE_NUMBER", text: b.texto, phone_number: b.telefono }
    )
  };
}
