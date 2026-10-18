import { db } from "@/lib/db";

export async function avisosDeCita(cita: { doctorId: bigint | null; servicioId?: bigint | null; inicio: Date; fin: Date }) {
  if (cita.doctorId === null) return [];
  const horarios = await db.horarioDoctor.count({ where: { doctorId: cita.doctorId } });
  return horarios ? [] : ["El especialista no tiene horarios definidos. Define su horario en Reservas en línea para activar el bloqueo de su agenda."];
}
