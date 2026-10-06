// Traduce los errores de envío de WhatsApp Cloud API a un motivo entendible para el agente.
// Códigos: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
const MOTIVOS: Record<number, string> = {
  131047: "Pasaron más de 24 h desde el último mensaje del cliente: solo se puede enviar una plantilla aprobada.",
  131026: "No se pudo entregar: el número no tiene WhatsApp o no acepta mensajes de empresas.",
  131049: "Meta limitó este mensaje de marketing para cuidar la experiencia del usuario. Intenta más tarde.",
  131050: "El cliente pidió dejar de recibir mensajes de marketing de este negocio.",
  131051: "WhatsApp no admite este tipo de mensaje.",
  131052: "No se pudo descargar el archivo del mensaje.",
  131053: "No se pudo subir el archivo: revisa el formato y el tamaño.",
  131056: "Se enviaron demasiados mensajes a este cliente en poco tiempo. Espera un momento.",
  132000: "La cantidad de variables no coincide con la plantilla.",
  132001: "La plantilla no existe o no está aprobada en ese idioma.",
  132015: "La plantilla está pausada por baja calidad.",
  132016: "La plantilla está desactivada por baja calidad.",
  131042: "Hay un problema con el método de pago de la cuenta de WhatsApp.",
  131031: "La cuenta de WhatsApp está restringida o bloqueada por Meta.",
  368: "La cuenta está restringida temporalmente por políticas de WhatsApp.",
  130429: "Se superó el límite de envío de la cuenta. Intenta más tarde."
};

export function motivoDeError(codigo: number | undefined, detalle?: string): string {
  const motivo = codigo ? MOTIVOS[codigo] : undefined;
  if (motivo) return motivo;
  const extra = detalle?.trim() ? `: ${detalle.trim()}` : "";
  return `Meta rechazó el mensaje${codigo ? ` (código ${codigo})` : ""}${extra}`;
}

/** Extrae código y detalle de un objeto de error de Graph o de un status del webhook. */
export function motivoDeErrorMeta(error: unknown): string {
  const e = (error ?? {}) as { code?: number; message?: string; title?: string; error_data?: { details?: string } };
  return motivoDeError(e.code, e.error_data?.details || e.message || e.title);
}
