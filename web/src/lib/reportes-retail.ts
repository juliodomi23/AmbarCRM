import { fechaValida, instanteLocal, sumarDias } from "@/lib/reservas/horarios";
import { ErrorRetail } from "@/lib/retail-db";

export class ErrorReporteRetail extends ErrorRetail {}

export function puedeVerReportesRetail(rol?: string, puesto?: string) {
  return rol === "admin" || puesto?.trim().toLocaleLowerCase("es-MX") === "encargado de tienda";
}

export function rangoReporte(desde: unknown, hasta: unknown, zona: string) {
  if (!fechaValida(desde) || !fechaValida(hasta)) throw new ErrorReporteRetail("Selecciona un rango de fechas válido");
  if (desde > hasta) throw new ErrorReporteRetail("La fecha inicial no puede ser posterior a la final");
  const dias = Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000) + 1;
  if (dias > 366) throw new ErrorReporteRetail("El rango máximo es de un año");
  return { desde, hasta, inicio: instanteLocal(desde, 0, zona), fin: instanteLocal(sumarDias(hasta, 1), 0, zona), dias };
}

export function fechaHoraLocal(instante: Date, zona: string) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
  }).formatToParts(instante);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  return { fecha: `${valor("year")}-${valor("month")}-${valor("day")}`, hora: `${valor("hour")}:00` };
}
