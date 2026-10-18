import { db } from "@/lib/db";
import { configReservasEmpresa } from "@/lib/reservas/servidor";
import { diaSemana, fechaLocal, instanteLocal, sumarDias, ventanasDelDia } from "@/lib/reservas/horarios";

export async function avisosDeCita(cita: { doctorId: bigint | null; servicioId?: bigint | null; inicio: Date; fin: Date }) {
  if (cita.doctorId === null) return [];
  const avisos: string[] = [];
  const cfg = await configReservasEmpresa();
  let fecha = fechaLocal(cita.inicio, cfg.zona);
  let cubierto = +cita.inicio;
  for (let dia = 0; dia < 3 && cubierto < +cita.fin; dia++, fecha = sumarDias(fecha, 1)) {
    const [reglas, excepciones] = await Promise.all([
      db.horarioDoctor.findMany({ where: { doctorId: cita.doctorId, diaSemana: diaSemana(fecha) } }),
      db.excepcionHorario.findMany({ where: { doctorId: cita.doctorId, fecha: new Date(`${fecha}T00:00:00Z`) } }),
    ]);
    for (const ventana of ventanasDelDia(reglas, excepciones).sort((a, b) => a.inicioMin - b.inicioMin)) {
      const inicio = +instanteLocal(fecha, ventana.inicioMin, cfg.zona);
      const fin = +instanteLocal(fecha, ventana.finMin, cfg.zona);
      if (inicio <= cubierto && fin > cubierto) cubierto = fin;
    }
  }
  if (cubierto < +cita.fin) avisos.push("La cita queda fuera del horario del especialista o en un día especial. Se guardó de todas formas.");
  if (cita.servicioId && !(await db.servicioReservaDoctor.findFirst({ where: { servicioId: cita.servicioId, doctorId: cita.doctorId } }))) {
    avisos.push("El especialista asignado no está configurado para dar este servicio.");
  }
  return avisos;
}
