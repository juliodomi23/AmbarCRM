/** Interpreta un datetime-local en la zona elegida para la campaña. */
export function fechaEnZona(valor: string, zonaHoraria: string) {
  const [fecha, hora] = valor.split("T");
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const [horas, minutos] = hora.split(":").map(Number);
  const esperado = Date.UTC(anio, mes - 1, dia, horas, minutos);
  let instante = esperado;
  const formato = new Intl.DateTimeFormat("en-US", { timeZone: zonaHoraria, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (let i = 0; i < 3; i++) {
    const partes = formato.formatToParts(new Date(instante));
    const valorParte = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value);
    const visto = Date.UTC(valorParte("year"), valorParte("month") - 1, valorParte("day"), valorParte("hour"), valorParte("minute"));
    instante += esperado - visto;
  }
  return new Date(instante).toISOString();
}
