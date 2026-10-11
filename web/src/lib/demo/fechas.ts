// Fechas relativas a «ahora» en hora de México, como en los seeds demo.
const ZONA = "America/Mexico_City";

/** Fecha a las `hora` en punto, `dias` días respecto a hoy (hora de México). */
export function fechaMexico(dias: number, hora: number): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const f = new Date(Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day)));
  f.setUTCDate(f.getUTCDate() + dias);
  return new Date(`${f.toISOString().slice(0, 10)}T${String(hora).padStart(2, "0")}:00:00-06:00`).toISOString();
}

/** Fecha de esta semana (lunes = 0) a las `hora`. */
export function fechaEstaSemana(diaDesdeLunes: number, hora: number): string {
  return fechaMexico(diaDesdeLunes - indiceDiaHoy(), hora);
}

/** Lunes = 0 … domingo = 6, en hora de México. */
export function indiceDiaHoy(): number {
  const d = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: ZONA }).format(new Date());
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(d);
}

export const hace = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();
