import { Prisma, type EstadoCita } from "@prisma/client";
import { transaccionTenant } from "@/lib/retail-db";
import { bloquearAgenda, ESTADOS_OCUPAN, hayEmpalme } from "@/lib/reservas/servidor";
import { errorIntervaloCita, puedeCambiarEstado } from "@/lib/citas-reglas";

export class ErrorCita extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function conErroresCita<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try { return await handler(...args); }
    catch (error) {
      if (error instanceof ErrorCita) return Response.json({ error: error.message }, { status: error.status });
      throw error;
    }
  };
}

export const incluirCita = {
  contacto: { select: { id: true, nombre: true, expediente: { select: { id: true } } } },
  responsable: { select: { id: true, nombre: true } },
  doctor: true,
} satisfies Prisma.CitaInclude;

type DatosAgenda = {
  titulo: string; notas: string | null; inicio: Date; fin: Date; doctorId: bigint | null;
  contactoId: bigint; conversacionId: bigint | null; responsableId: bigint | null;
};

export async function crearCitaInterna(orgId: bigint, datos: DatosAgenda, bloquear = true) {
  return transaccionTenant(orgId, async (tx) => {
    const error = errorIntervaloCita(datos.inicio, datos.fin);
    if (error) throw new ErrorCita(error);
    if (datos.doctorId !== null) {
      const [doctor] = await bloquearAgenda(tx, [datos.doctorId], bloquear);
      if (!doctor?.activo) throw new ErrorCita("Especialista inexistente o inactivo");
      if (await hayEmpalme(tx, doctor.id, datos.inicio, datos.fin)) throw new ErrorCita("El especialista ya tiene una cita en ese horario", 409);
    }
    return tx.cita.create({ data: datos, include: incluirCita });
  });
}

export type CambiosCita = Partial<Pick<DatosAgenda, "titulo" | "notas" | "inicio" | "fin" | "doctorId">> & { estado?: EstadoCita };

export async function eliminarCitaCancelada(orgId: bigint, id: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM citas WHERE id = ${id} FOR UPDATE`;
    const cita = await tx.cita.findFirst({ where: { id } });
    if (!cita) throw new ErrorCita("Cita inexistente", 404);
    if (cita.estado !== "cancelada") throw new ErrorCita("Cancela la cita antes de eliminarla", 409);
    if (await tx.evolucionClinica.count({ where: { citaId: id } })) {
      throw new ErrorCita("No se puede eliminar la cita porque tiene una evolución clínica ligada", 409);
    }
    await tx.cita.delete({ where: { id } });
  });
}

export async function editarCita(orgId: bigint, id: bigint, datos: CambiosCita) {
  return transaccionTenant(orgId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM citas WHERE id = ${id} FOR UPDATE`;
    const actual = await tx.cita.findFirst({ where: { id } });
    if (!actual) throw new ErrorCita("Cita inexistente", 404);
    const siguiente = { ...actual, ...datos };
    const movida = +siguiente.inicio !== +actual.inicio || +siguiente.fin !== +actual.fin || siguiente.doctorId !== actual.doctorId;
    if (!puedeCambiarEstado(actual.estado, siguiente.estado)) throw new ErrorCita(`Una cita ${actual.estado.replaceAll("_", " ")} no puede pasar a ${siguiente.estado.replaceAll("_", " ")}`, 409);
    if (movida && !["programada", "confirmada"].includes(actual.estado)) throw new ErrorCita("Solo se pueden reprogramar citas programadas o confirmadas", 409);
    const error = errorIntervaloCita(siguiente.inicio, siguiente.fin);
    if (error) throw new ErrorCita(error);
    const ids = [actual.doctorId, siguiente.doctorId].filter((valor): valor is bigint => valor !== null);
    const doctores = await bloquearAgenda(tx, ids);
    if (movida && siguiente.doctorId !== null && !doctores.find((d) => d.id === siguiente.doctorId)?.activo) throw new ErrorCita("Reasigna la cita a un especialista activo");
    if (siguiente.doctorId !== null && ESTADOS_OCUPAN.includes(siguiente.estado) && (movida || !ESTADOS_OCUPAN.includes(actual.estado))) {
      if (await hayEmpalme(tx, siguiente.doctorId, siguiente.inicio, siguiente.fin, id)) throw new ErrorCita("El especialista ya tiene una cita en ese horario", 409);
    }
    const cita = await tx.cita.update({ where: { id }, data: {
      ...datos, ...(movida ? { recordatorioEnviadoAt: null, recordatorioIntentos: 0, recordatorioIntentadoAt: null } : {}),
    }, include: incluirCita });
    return { cita, completada: actual.estado !== "completada" && cita.estado === "completada" };
  });
}
