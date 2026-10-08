import type { OpcionCampo } from "@/components/modulos/FormularioModulo";

/** Opciones de los formularios de módulos. Los valores coinciden con los que cuentan las métricas. */
const lista = (...pares: [string, string][]): OpcionCampo[] =>
  pares.map(([valor, etiqueta]) => ({ valor, etiqueta }));

export const OPCIONES = {
  metodoPago: lista(["efectivo", "Efectivo"], ["transferencia", "Transferencia"], ["tarjeta", "Tarjeta"]),
  estadoTour: lista(["publicado", "Publicado"], ["borrador", "Borrador"], ["cerrado", "Cerrado"]),
  estadoReserva: lista(["solicitada", "Solicitada"], ["confirmada", "Confirmada"]),
  estadoAlumno: lista(["activo", "Activo"], ["baja", "Baja"]),
  modalidad: lista(["presencial", "Presencial"], ["en_linea", "En línea"], ["hibrido", "Híbrido"]),
  estadoCurso: lista(["abierto", "Abierto"], ["cerrado", "Cerrado"]),
  estadoColegiatura: lista(["pendiente", "Pendiente"], ["pagada", "Pagada"]),
  asistencia: lista(["presente", "Presente"], ["falta", "Falta"], ["retardo", "Retardo"], ["justificada", "Justificada"]),
  estadoExpediente: lista(["activo", "Activo"], ["suspendido", "Suspendido"], ["cerrado", "Cerrado"], ["archivado", "Archivado"]),
  estadoAsesoria: lista(
    ["pendiente", "Pendiente"],
    ["en_seguimiento", "En seguimiento"],
    ["contrato_firmado", "Contrato firmado"],
    ["descartada", "Descartada"],
  ),
  tipoMovimiento: lista(["pago", "Pago recibido"], ["plan_pago", "Plan de pago"], ["gasto", "Gasto"], ["diligencia", "Diligencia"]),
  tipoRegistroLegal: lista(
    ["seguimiento", "Seguimiento"],
    ["actuacion", "Actuación"],
    ["audiencia", "Audiencia"],
    ["documento", "Documento"],
    ["termino", "Término"],
    ["parte", "Parte"],
  ),
  tipoOperacion: lista(["checada", "Checada"], ["actividad", "Actividad"], ["incidencia", "Incidencia"]),
};

/** Convierte registros de la BD en opciones de un select, con una opción vacía si no es obligatorio. */
export function opcionesDe<T extends { id: bigint }>(
  filas: T[],
  etiqueta: (fila: T) => string,
  vacia?: string,
): OpcionCampo[] {
  const opciones = filas.map((fila) => ({ valor: String(fila.id), etiqueta: etiqueta(fila) }));
  return vacia === undefined ? opciones : [{ valor: "", etiqueta: vacia }, ...opciones];
}

/** Fecha de hoy (AAAA-MM-DD) en la hora de México, para precargar campos de fecha. */
export function hoyMexico() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

// ponytail: los selects cargan hasta 500 opciones; con catálogos más grandes, usar búsqueda como SelectorContacto.
export const LIMITE_OPCIONES = 500;
