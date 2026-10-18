export function duracionCitas(config: unknown) {
  const valor = (config as { duracionMin?: unknown } | null)?.duracionMin;
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 5 && valor <= 480 ? valor : 30;
}

export function finDeCita(inicio: Date, duracionMin: number) {
  return new Date(+inicio + duracionMin * 60_000);
}

export function finOcupado(cita: { fin: Date; origen: string; servicio?: { bufferMin: number } | null }) {
  return finDeCita(cita.fin, cita.origen === "interna" ? cita.servicio?.bufferMin ?? 0 : 0);
}

export function finVisible(cita: { fin: Date | string; origen?: string; servicio?: { bufferMin: number } | null }) {
  return finDeCita(new Date(cita.fin), cita.origen && cita.origen !== "interna" ? -(cita.servicio?.bufferMin ?? 0) : 0);
}
