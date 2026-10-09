/**
 * Motor de horarios de Reservas en línea (portado de Cita en Click, sin dependencias).
 * Las horas del negocio se guardan como minutos desde la medianoche en su zona IANA y se
 * convierten a instantes UTC solo para un día concreto. Probado en scripts/check-reservas.ts.
 */

export type Ventana = { inicioMin: number; finMin: number };
export type Ocupado = { inicio: Date | string; fin: Date | string };
export type Excepcion = { inicioMin: number | null; finMin: number | null };

/** Desfase de la zona respecto a UTC en ese instante, en minutos (Ciudad de México: -360). */
export function desfaseZona(instante: Date, zona: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value);
  const comoUtc = Date.UTC(valor("year"), valor("month") - 1, valor("day"), valor("hour"), valor("minute"), valor("second"));
  return Math.round((comoUtc - instante.getTime()) / 60_000);
}

/** Instante UTC de una hora local (minutos desde medianoche) de un día en la zona del negocio. */
export function instanteLocal(fecha: string, minutos: number, zona: string): Date {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const ingenuo = Date.UTC(anio, mes - 1, dia, 0, minutos);
  // Dos pasadas: si ese día cambia el horario de verano, el desfase correcto es el del instante final.
  const primero = ingenuo - desfaseZona(new Date(ingenuo), zona) * 60_000;
  return new Date(ingenuo - desfaseZona(new Date(primero), zona) * 60_000);
}

/** Fecha local (AAAA-MM-DD) de un instante en la zona del negocio. */
export function fechaLocal(instante: Date, zona: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(instante);
}

/** Día de la semana de una fecha AAAA-MM-DD: 0 = domingo … 6 = sábado. */
export function diaSemana(fecha: string) {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

export function fechaValida(fecha: unknown): fecha is string {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  return new Date(`${fecha}T12:00:00Z`).toISOString().slice(0, 10) === fecha;
}

/** Suma días a una fecha AAAA-MM-DD sin pasar por zonas horarias. */
export function sumarDias(fecha: string, dias: number) {
  const base = new Date(`${fecha}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

/** "09:30" → 570. Devuelve null si no es una hora válida (24:00 se acepta como fin del día). */
export function minutosDeHora(hora: unknown): number | null {
  const m = String(hora ?? "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const minutos = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && minutos <= 1440 ? minutos : null;
}

/** 570 → "09:30". */
export function horaTexto(minutos: number) {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

/** Horario efectivo de un día: si hay excepciones mandan (sin horas = cerrado); si no, la regla semanal. */
export function ventanasDelDia(reglas: Ventana[], excepciones: Excepcion[]): Ventana[] {
  if (excepciones.length > 0) {
    return excepciones
      .filter((e): e is Ventana => e.inicioMin !== null && e.finMin !== null)
      .map(({ inicioMin, finMin }) => ({ inicioMin, finMin }));
  }
  return [...reglas].sort((a, b) => a.inicioMin - b.inicioMin);
}

/** Horarios libres de un día, como instantes UTC en ISO. Los rangos son medio abiertos [inicio, fin). */
export function calcularHorarios(entrada: {
  fecha: string;
  zona: string;
  ventanas: Ventana[];
  ocupados: Ocupado[];
  duracionMin: number;
  bufferMin: number;
  granularidadMin: number;
  anticipacionMin: number;
  ahora?: Date;
}): string[] {
  const ahora = entrada.ahora ?? new Date();
  const temprano = ahora.getTime() + entrada.anticipacionMin * 60_000;
  const ocupados = entrada.ocupados.map((o) => [new Date(o.inicio).getTime(), new Date(o.fin).getTime()] as const);
  const total = (entrada.duracionMin + entrada.bufferMin) * 60_000;
  const paso = Math.max(5, entrada.granularidadMin) * 60_000;
  const libres = new Set<string>();

  for (const ventana of entrada.ventanas) {
    const inicio = instanteLocal(entrada.fecha, ventana.inicioMin, entrada.zona).getTime();
    const fin = instanteLocal(entrada.fecha, ventana.finMin, entrada.zona).getTime();
    for (let s = inicio; s + total <= fin; s += paso) {
      if (s < temprano) continue;
      const e = s + total;
      if (ocupados.some(([a, b]) => a < e && s < b)) continue;
      libres.add(new Date(s).toISOString());
    }
  }
  return [...libres].sort();
}
