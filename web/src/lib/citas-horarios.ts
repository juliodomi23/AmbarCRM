import { diaSemana, fechaLocal, horaTexto, instanteLocal, ventanasDelDia, type Ventana } from "@/lib/reservas/horarios";

export type AgendaEspecialista = {
  horarios: (Ventana & { diaSemana: number })[];
  excepciones: { fecha: string | Date; inicioMin: number | null; finMin: number | null }[];
};

export function ventanasCita(agenda: AgendaEspecialista, fecha: string) {
  return ventanasDelDia(
    agenda.horarios.filter((horario) => horario.diaSemana === diaSemana(fecha)),
    agenda.excepciones.filter((excepcion) => String(excepcion.fecha instanceof Date ? excepcion.fecha.toISOString() : excepcion.fecha).slice(0, 10) === fecha),
  );
}

export function errorHorarioCita(agenda: AgendaEspecialista, inicio: Date, fin: Date, zona: string) {
  if (!agenda.horarios.length) return null;
  const fecha = fechaLocal(inicio, zona);
  const ventanas = ventanasCita(agenda, fecha);
  if (ventanas.some((ventana) => inicio >= instanteLocal(fecha, ventana.inicioMin, zona) && fin <= instanteLocal(fecha, ventana.finMin, zona))) return null;
  const horario = ventanas.length ? ventanas.map((ventana) => `${horaTexto(ventana.inicioMin)}–${horaTexto(ventana.finMin)}`).join(", ") : "cerrado ese día";
  return `Ese especialista no atiende a esa hora. Horario: ${horario}. La cita completa debe caber en una sola ventana.`;
}

export function errorFechaPasada(inicio: Date, zona: string, ahora = new Date()) {
  return fechaLocal(inicio, zona) < fechaLocal(ahora, zona) ? "Solo puedes agendar desde hoy en la zona del negocio; no se admiten días anteriores" : null;
}
