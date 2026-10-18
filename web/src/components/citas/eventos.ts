import { fechaMexicoAUTC, sumarDias, ZONA_CITAS } from "./fecha";
import type { Cita } from "./tipos";

export function eventosDelDia(citas: Cita[], dia: string, zona = ZONA_CITAS) {
  const desde = +fechaMexicoAUTC(dia, "00:00", zona);
  const hasta = +fechaMexicoAUTC(sumarDias(dia, 1), "00:00", zona);
  const eventos = citas.filter((c) => +new Date(c.inicio) < hasta && +new Date(c.fin) > desde)
    .map((cita) => ({ cita, inicio: Math.max(desde, +new Date(cita.inicio)), fin: Math.min(hasta, +new Date(cita.fin)), columna: 0, columnas: 1 }))
    .sort((a, b) => a.inicio - b.inicio || a.cita.id.localeCompare(b.cita.id));
  let grupo: typeof eventos = [];
  let finales: number[] = [];
  const cerrar = () => { for (const evento of grupo) evento.columnas = finales.length; grupo = []; finales = []; };
  for (const evento of eventos) {
    if (grupo.length && finales.every((fin) => fin <= evento.inicio)) cerrar();
    let columna = finales.findIndex((fin) => fin <= evento.inicio);
    if (columna === -1) columna = finales.length;
    finales[columna] = evento.fin;
    evento.columna = columna;
    grupo.push(evento);
  }
  cerrar();
  return eventos;
}
