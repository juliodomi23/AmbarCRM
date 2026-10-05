/** ¿La hora actual cae FUERA del horario de atención configurado? */
export function estaFueraDeHorario(
  a: { horarioInicio?: string | null; horarioFin?: string | null; horarioDias?: string | null },
  ahora = new Date()
): boolean {
  const ini = a.horarioInicio || "09:00";
  const fin = a.horarioFin || "18:00";
  const dias = (a.horarioDias || "1,2,3,4,5").split(",").map((s) => s.trim()).filter(Boolean);

  const jsDay = ahora.getDay(); // 0 = domingo
  const diaSemana = jsDay === 0 ? 7 : jsDay; // 1 = lunes … 7 = domingo
  if (!dias.includes(String(diaSemana))) return true; // día no hábil

  const hhmm = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
  return hhmm < ini || hhmm >= fin; // comparación lexicográfica válida con HH:MM 24h
}
