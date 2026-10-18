import { Prisma, type EstadoCita } from "@prisma/client";
import { transaccionTenant } from "@/lib/retail-db";
import { bloquearAgenda, ESTADOS_OCUPAN, hayEmpalme } from "@/lib/reservas/servidor";
import { errorIntervaloCita, puedeCambiarEstado } from "@/lib/citas-reglas";
import { configReservas } from "@/lib/reservas/servidor";
import { errorFechaPasada, errorHorarioCita } from "@/lib/citas-horarios";
import { duracionCitas, finDeCita } from "@/lib/citas-duracion";

async function resolverDuracion(tx: Prisma.TransactionClient, datos: { inicio: Date; fin?: Date; doctorId: bigint | null; servicioId?: bigint | null }) {
  const servicio = datos.servicioId ? await tx.servicioReserva.findFirst({ where: { id: datos.servicioId, activo: true } }) : null;
  if (datos.servicioId && !servicio) throw new ErrorCita("Servicio inexistente o inactivo");
  if (servicio && datos.doctorId !== null && !(await tx.servicioReservaDoctor.findFirst({ where: { servicioId: servicio.id, doctorId: datos.doctorId } }))) {
    throw new ErrorCita("El especialista seleccionado no ofrece ese servicio");
  }
  const modulo = await tx.moduloOrg.findFirst({ where: { clave: "citas" }, select: { config: true } });
  const calculado = finDeCita(datos.inicio, servicio?.duracionMin ?? duracionCitas(modulo?.config));
  if (servicio && datos.fin && +datos.fin !== +calculado) throw new ErrorCita(`El fin debe coincidir con los ${servicio.duracionMin} minutos del servicio; el margen no se incluye en la hora visible`);
  return { fin: datos.fin ?? calculado, bufferMin: servicio?.bufferMin ?? 0 };
}

async function validarHorario(tx: Prisma.TransactionClient, datos: { inicio: Date; fin: Date; doctorId: bigint | null }) {
  const modulo = await tx.moduloOrg.findFirst({ where: { clave: "reservas_en_linea" }, select: { config: true } });
  const { zona } = configReservas(modulo?.config);
  const pasado = errorFechaPasada(datos.inicio, zona);
  if (pasado) throw new ErrorCita(pasado);
  if (datos.doctorId === null) return;
  const [horarios, excepciones] = await Promise.all([
    tx.horarioDoctor.findMany({ where: { doctorId: datos.doctorId } }),
    tx.excepcionHorario.findMany({ where: { doctorId: datos.doctorId } }),
  ]);
  const error = errorHorarioCita({ horarios, excepciones }, datos.inicio, datos.fin, zona);
  if (error) throw new ErrorCita(error, 409);
}

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
  titulo: string; notas: string | null; inicio: Date; fin?: Date; doctorId: bigint | null; servicioId?: bigint | null;
  contactoId: bigint; conversacionId: bigint | null; responsableId: bigint | null;
};

export async function crearCitaInterna(orgId: bigint, datos: DatosAgenda, bloquear = true) {
  return transaccionTenant(orgId, async (tx) => {
    const { fin, bufferMin } = await resolverDuracion(tx, datos);
    const error = errorIntervaloCita(datos.inicio, fin);
    if (error) throw new ErrorCita(error);
    if (datos.doctorId !== null) {
      const [doctor] = await bloquearAgenda(tx, [datos.doctorId], bloquear);
      if (!doctor?.activo) throw new ErrorCita("Especialista inexistente o inactivo");
      if (await hayEmpalme(tx, doctor.id, datos.inicio, finDeCita(fin, bufferMin))) throw new ErrorCita("El especialista ya tiene una cita en ese horario", 409);
    }
    await validarHorario(tx, { ...datos, fin: finDeCita(fin, bufferMin) });
    return tx.cita.create({ data: { ...datos, fin }, include: incluirCita });
  });
}

export type CambiosCita = Partial<Pick<DatosAgenda, "titulo" | "notas" | "inicio" | "fin" | "doctorId" | "servicioId">> & { estado?: EstadoCita };

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
    let bufferMin = 0;
    if (datos.inicio || datos.fin || "servicioId" in datos || "doctorId" in datos) {
      const inicio = datos.inicio ?? actual.inicio;
      const servicioId = "servicioId" in datos ? datos.servicioId : actual.servicioId;
      const cambiaServicio = servicioId !== actual.servicioId;
      const fin = datos.fin ?? (cambiaServicio ? undefined : finDeCita(inicio, (+actual.fin - +actual.inicio) / 60_000));
      if (actual.origen === "interna" || cambiaServicio) {
        const resuelto = await resolverDuracion(tx, { inicio, fin, servicioId, doctorId: "doctorId" in datos ? datos.doctorId! : actual.doctorId });
        datos = { ...datos, fin: resuelto.fin };
        bufferMin = resuelto.bufferMin;
      } else if (!datos.fin && datos.inicio) datos = { ...datos, fin };
    }
    const siguiente = { ...actual, ...datos };
    const movida = +siguiente.inicio !== +actual.inicio || +siguiente.fin !== +actual.fin || siguiente.doctorId !== actual.doctorId;
    if (siguiente.servicioId !== actual.servicioId && !["programada", "confirmada"].includes(actual.estado)) throw new ErrorCita("Solo se puede cambiar el servicio de citas programadas o confirmadas", 409);
    if (!puedeCambiarEstado(actual.estado, siguiente.estado)) throw new ErrorCita(`Una cita ${actual.estado.replaceAll("_", " ")} no puede pasar a ${siguiente.estado.replaceAll("_", " ")}`, 409);
    if (movida && !["programada", "confirmada"].includes(actual.estado)) throw new ErrorCita("Solo se pueden reprogramar citas programadas o confirmadas", 409);
    const error = errorIntervaloCita(siguiente.inicio, siguiente.fin);
    if (error) throw new ErrorCita(error);
    const ids = [actual.doctorId, siguiente.doctorId].filter((valor): valor is bigint => valor !== null);
    const doctores = await bloquearAgenda(tx, ids);
    if (movida && siguiente.doctorId !== null && !doctores.find((d) => d.id === siguiente.doctorId)?.activo) throw new ErrorCita("Reasigna la cita a un especialista activo");
    const ocupacion = { ...siguiente, fin: finDeCita(siguiente.fin, bufferMin) };
    if (movida || siguiente.servicioId !== actual.servicioId) await validarHorario(tx, ocupacion);
    if (siguiente.doctorId !== null && ESTADOS_OCUPAN.includes(siguiente.estado) && (movida || siguiente.servicioId !== actual.servicioId || !ESTADOS_OCUPAN.includes(actual.estado))) {
      if (await hayEmpalme(tx, siguiente.doctorId, siguiente.inicio, ocupacion.fin, id)) throw new ErrorCita("El especialista ya tiene una cita en ese horario", 409);
    }
    const cita = await tx.cita.update({ where: { id }, data: {
      ...datos, ...(movida ? { recordatorioEnviadoAt: null, recordatorioIntentos: 0, recordatorioIntentadoAt: null } : {}),
    }, include: incluirCita });
    return { cita, completada: actual.estado !== "completada" && cita.estado === "completada" };
  });
}
