export const ZONA_CITAS = "America/Mexico_City";
export function fechaHoraCita(date: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: ZONA_CITAS,
  }).format(date);
}
export function recordatorioDebeEnviarse(
  inicio: Date,
  anticipacionHoras: number,
  ahora = new Date(),
) {
  return (
    inicio.getTime() - ahora.getTime() <= anticipacionHoras * 3_600_000 &&
    inicio > ahora
  );
}
