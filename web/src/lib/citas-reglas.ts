import type { EstadoCita } from "@prisma/client";

export const TRANSICIONES_CITA: Record<EstadoCita, readonly EstadoCita[]> = {
  programada: ["programada", "confirmada", "en_sala", "completada", "cancelada", "no_asistio"],
  confirmada: ["confirmada", "en_sala", "completada", "cancelada", "no_asistio"],
  en_sala: ["en_sala", "completada", "cancelada"],
  completada: ["completada"],
  cancelada: ["cancelada"],
  no_asistio: ["no_asistio"],
};

export function puedeCambiarEstado(actual: EstadoCita, siguiente: EstadoCita) {
  return TRANSICIONES_CITA[actual].includes(siguiente);
}

export function errorIntervaloCita(inicio: Date, fin: Date) {
  if ([inicio, fin].some((fecha) => !Number.isFinite(+fecha) || fecha.getUTCFullYear() < 2000 || fecha.getUTCFullYear() > 2100)) {
    return "Las fechas deben estar entre los años 2000 y 2100";
  }
  if (fin <= inicio) return "El fin debe ser posterior al inicio";
  if (+fin - +inicio > 86_400_000) return "La cita no puede durar más de 24 horas";
  return null;
}

export function errorTextoCita(datos: { titulo?: unknown; notas?: unknown }) {
  if ("titulo" in datos && (typeof datos.titulo !== "string" || !datos.titulo.trim() || datos.titulo.trim().length > 200)) {
    return "El título es obligatorio y admite hasta 200 caracteres";
  }
  if ("notas" in datos && datos.notas !== null && (typeof datos.notas !== "string" || datos.notas.trim().length > 5000)) {
    return "Las notas admiten hasta 5000 caracteres";
  }
  return null;
}
