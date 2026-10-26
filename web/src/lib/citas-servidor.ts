import { Prisma, type EstadoCita } from "@prisma/client";
import { transaccionTenant } from "@/lib/retail-db";
import { bloquearAgenda, ESTADOS_OCUPAN, hayEmpalme } from "@/lib/reservas/servidor";
import { errorIntervaloCita, puedeCambiarEstado } from "@/lib/citas-reglas";
import { configReservas } from "@/lib/reservas/servidor";
import { errorFechaPasada, errorHorarioCita } from "@/lib/citas-horarios";
import { duracionCitas, finDeCita, finVisible } from "@/lib/citas-duracion";
import { accesoAgenda, permiteEspecialista, type IdentidadAgenda } from "@/lib/citas-acceso";
import { nuevoTokenCita } from "@/lib/citas-token";
import { runWithOrg } from "@/lib/db";

async function resolverDuracion(tx: Prisma.TransactionClient, datos: { inicio: Date; fin?: Date; doctorId: bigint | null; servicioId?: bigint | null }) {
  if (datos.servicioId) await tx.$queryRaw`SELECT id FROM servicios_reserva WHERE id = ${datos.servicioId} FOR SHARE`;
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
  servicio: { select: { bufferMin: true, duracionMin: true } },
} satisfies Prisma.CitaInclude;

type DatosAgenda = {
  titulo: string; notas: string | null; inicio: Date; fin?: Date; doctorId: bigint | null; servicioId?: bigint | null;
  contactoId: bigint; conversacionId: bigint | null; responsableId: bigint | null;
};

export async function crearCitaInterna(orgId: bigint, datos: DatosAgenda, bloquear = true, sesion?: IdentidadAgenda) {
  const cita = await transaccionTenant(orgId, async (tx) => {
    if (sesion && !permiteEspecialista(await accesoAgenda(sesion, tx), datos.doctorId)) throw new ErrorCita("Solo puedes agendar con tu especialista asignado", 403);
    const doctores = datos.doctorId !== null ? await bloquearAgenda(tx, [datos.doctorId], bloquear) : [];
    if (datos.doctorId !== null && !doctores[0]?.activo) throw new ErrorCita("Especialista inexistente o inactivo");
    const { fin, bufferMin } = await resolverDuracion(tx, datos);
    const error = errorIntervaloCita(datos.inicio, fin);
    if (error) throw new ErrorCita(error);
    if (datos.doctorId !== null) {
      if (await hayEmpalme(tx, datos.doctorId, datos.inicio, finDeCita(fin, bufferMin))) throw new ErrorCita("El especialista ya tiene una cita en ese horario", 409);
    }
    await validarHorario(tx, { ...datos, fin: finDeCita(fin, bufferMin) });
    return tx.cita.create({ data: { ...datos, fin, tokenGestion: nuevoTokenCita() }, include: incluirCita });
  });
  const { pushCitaCalendario } = await import("@/lib/calendario/servicio");
  await runWithOrg(orgId, () => pushCitaCalendario(cita.id)).catch(() => undefined);
  return cita;
}

export type CambiosCita = Partial<Pick<DatosAgenda, "titulo" | "notas" | "inicio" | "fin" | "doctorId" | "servicioId">> & { estado?: EstadoCita };

export async function eliminarCitaCancelada(orgId: bigint, id: bigint, sesion?: IdentidadAgenda) {
  return transaccionTenant(orgId, async (tx) => {
    const acceso = sesion ? await accesoAgenda(sesion, tx) : null;
    await tx.$queryRaw`SELECT id FROM citas WHERE id = ${id} FOR UPDATE`;
    const cita = await tx.cita.findFirst({ where: { id } });
    if (!cita || (acceso && !permiteEspecialista(acceso, cita.doctorId))) throw new ErrorCita("Cita inexistente", 404);
    if (cita.estado !== "cancelada") throw new ErrorCita("Cancela la cita antes de eliminarla", 409);
    if (await tx.evolucionClinica.count({ where: { citaId: id } })) {
      throw new ErrorCita("No se puede eliminar la cita porque tiene una evolución clínica ligada", 409);
    }
    await tx.cita.delete({ where: { id } });
  });
}

export async function editarCita(orgId: bigint, id: bigint, datos: CambiosCita, sesion?: IdentidadAgenda) {
  const resultado = await transaccionTenant(orgId, async (tx) => {
    const acceso = sesion ? await accesoAgenda(sesion, tx) : null;
    await tx.$queryRaw`SELECT id FROM citas WHERE id = ${id} FOR UPDATE`;
    const actual = await tx.cita.findFirst({ where: { id }, include: { servicio: { select: { bufferMin: true } } } });
    if (!actual || (acceso && !permiteEspecialista(acceso, actual.doctorId))) throw new ErrorCita("Cita inexistente", 404);
    if (acceso && "doctorId" in datos && !permiteEspecialista(acceso, datos.doctorId ?? null)) throw new ErrorCita("Solo puedes usar tu especialista asignado", 403);
    const ids = [actual.doctorId, "doctorId" in datos ? datos.doctorId : actual.doctorId].filter((valor): valor is bigint => valor != null);
    const doctores = await bloquearAgenda(tx, ids);
    let bufferMin = 0;
    if (datos.inicio || datos.fin || "servicioId" in datos || "doctorId" in datos) {
      const inicio = datos.inicio ?? actual.inicio;
      const servicioId = "servicioId" in datos ? datos.servicioId : actual.servicioId;
      const cambiaServicio = servicioId !== actual.servicioId;
      const fin = datos.fin ?? (cambiaServicio ? undefined : finDeCita(inicio, (+finVisible(actual) - +actual.inicio) / 60_000));
      const resuelto = await resolverDuracion(tx, { inicio, fin, servicioId, doctorId: "doctorId" in datos ? datos.doctorId! : actual.doctorId });
      datos = { ...datos, fin: actual.origen === "interna" ? resuelto.fin : finDeCita(resuelto.fin, resuelto.bufferMin) };
      bufferMin = actual.origen === "interna" ? resuelto.bufferMin : 0;
    }
    const siguiente = { ...actual, ...datos };
    const movida = +siguiente.inicio !== +actual.inicio || +siguiente.fin !== +actual.fin || siguiente.doctorId !== actual.doctorId;
    if (siguiente.servicioId !== actual.servicioId && !["programada", "confirmada"].includes(actual.estado)) throw new ErrorCita("Solo se puede cambiar el servicio de citas programadas o confirmadas", 409);
    if (!puedeCambiarEstado(actual.estado, siguiente.estado)) throw new ErrorCita(`Una cita ${actual.estado.replaceAll("_", " ")} no puede pasar a ${siguiente.estado.replaceAll("_", " ")}`, 409);
    if (movida && !["programada", "confirmada"].includes(actual.estado)) throw new ErrorCita("Solo se pueden reprogramar citas programadas o confirmadas", 409);
    const error = errorIntervaloCita(siguiente.inicio, siguiente.fin);
    if (error) throw new ErrorCita(error);
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
  const { pushCitaCalendario } = await import("@/lib/calendario/servicio");
  await runWithOrg(orgId, () => pushCitaCalendario(resultado.cita.id)).catch(() => undefined);
  return resultado;
}
