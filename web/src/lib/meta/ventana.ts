// Ventana de servicio de WhatsApp: tras el último mensaje del cliente, el negocio puede
// responder con mensajes libres durante este tiempo. Después, solo con plantillas aprobadas.
// (La ventana de 72 h de anuncios Click to WhatsApp es de cobro, no cambia esta regla.)
export const HORAS_VENTANA = 24;

export function estadoVentana(ultimoEntrante: Date | string | null | undefined, ahora: Date = new Date()) {
  if (!ultimoEntrante) return { abierta: false, restanteMs: 0 };
  const cierre = new Date(ultimoEntrante).getTime() + HORAS_VENTANA * 60 * 60 * 1000;
  const restanteMs = Math.max(0, cierre - ahora.getTime());
  return { abierta: restanteMs > 0, restanteMs };
}

export function textoRestante(restanteMs: number): string {
  const minutos = Math.floor(restanteMs / 60000);
  if (minutos < 1) return "menos de 1 min";
  if (minutos < 60) return `${minutos} min`;
  const resto = minutos % 60;
  return resto ? `${Math.floor(minutos / 60)} h ${resto} min` : `${minutos / 60} h`;
}
