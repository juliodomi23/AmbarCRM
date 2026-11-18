/**
 * Métricas de resultado que el dueño del negocio puede elegir en Configuración.
 *
 * Meta reporta el mismo evento con varios nombres a la vez, por eso el sync
 * guarda una sola métrica por fila. Aquí viven las opciones visibles en la UI
 * (texto en español llano) y su nombre técnico en la API de Meta.
 *
 * Este archivo es seguro para componentes cliente: no importa Prisma ni node:crypto.
 */

export const ACCIONES_RESULTADO = [
  {
    valor: "onsite_conversion.messaging_conversation_started_7d",
    etiqueta: "Conversación de WhatsApp iniciada",
  },
  { valor: "purchase", etiqueta: "Compra" },
  { valor: "lead", etiqueta: "Formulario de contacto" },
] as const;

export type AccionResultado = (typeof ACCIONES_RESULTADO)[number]["valor"];

/** Opción que se usa cuando la organización no ha elegido una métrica. */
export const ACCION_RESULTADO_POR_DEFECTO: AccionResultado = ACCIONES_RESULTADO[0].valor;

export function esAccionResultado(valor: unknown): valor is AccionResultado {
  return typeof valor === "string" && ACCIONES_RESULTADO.some((opcion) => opcion.valor === valor);
}

export function etiquetaAccionResultado(valor: string | null | undefined): string {
  return ACCIONES_RESULTADO.find((opcion) => opcion.valor === valor)?.etiqueta ?? ACCIONES_RESULTADO[0].etiqueta;
}
