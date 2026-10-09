import { Prisma } from "@prisma/client";
import { ErrorCupo } from "@/lib/cupos-db";
import { transaccionTenant } from "@/lib/retail-db";

/** Estados de reserva que ya no ocupan lugar en el tour. */
const RESERVA_LIBRE = ["cancelada", "reembolsada"];

async function bloquear(tx: Prisma.TransactionClient, tabla: "tours" | "reservas_tour" | "cursos_academia", id: bigint) {
  const filas = await tx.$queryRaw<{ id: bigint }[]>(
    Prisma.sql`SELECT id FROM ${Prisma.raw(tabla)} WHERE id = ${id} FOR UPDATE`,
  );
  if (filas.length === 0) throw new ErrorCupo("Registro no encontrado", 404);
}

async function ocupacionTour(tx: Prisma.TransactionClient, tourId: bigint, excepto?: bigint) {
  const suma = await tx.reservaTour.aggregate({
    where: { tourId, estado: { notIn: RESERVA_LIBRE }, ...(excepto ? { id: { not: excepto } } : {}) },
    _sum: { viajeros: true },
  });
  return suma._sum.viajeros ?? 0;
}

/** El cupo de un tour no puede quedar por debajo de los viajeros ya reservados. */
export function actualizarTour(orgId: bigint, id: bigint, data: Prisma.TourUpdateInput & { capacidad: number }) {
  return transaccionTenant(orgId, async (tx) => {
    await bloquear(tx, "tours", id);
    const ocupados = await ocupacionTour(tx, id);
    if (data.capacidad < ocupados) {
      throw new ErrorCupo(`El cupo no puede ser menor a los ${ocupados} viajeros ya reservados`);
    }
    return tx.tour.update({ where: { id }, data });
  });
}

/** Cambia estado, viajeros o total de una reserva cuidando el cupo y el saldo ya pagado. */
export function actualizarReserva(
  orgId: bigint,
  id: bigint,
  cambios: { estado?: string; viajeros?: number; total?: number; notas?: string | null; fechaSalida?: Date | null },
) {
  return transaccionTenant(orgId, async (tx) => {
    const previa = await tx.reservaTour.findUnique({ where: { id }, select: { tourId: true } });
    if (!previa) throw new ErrorCupo("Reserva no encontrada", 404);
    await bloquear(tx, "tours", previa.tourId);
    await bloquear(tx, "reservas_tour", id);
    const actual = await tx.reservaTour.findUniqueOrThrow({ where: { id }, include: { tour: true } });
    const estado = cambios.estado ?? actual.estado;
    const viajeros = cambios.viajeros ?? actual.viajeros;
    if (!RESERVA_LIBRE.includes(estado)) {
      const ocupados = await ocupacionTour(tx, actual.tourId, id);
      if (ocupados + viajeros > actual.tour.capacidad) throw new ErrorCupo("No hay cupo suficiente");
    }
    const pagado = await tx.pagoTour.aggregate({ where: { reservaId: id, estado: "aplicado" }, _sum: { monto: true } });
    const totalPagado = Number(pagado._sum.monto ?? 0);
    const total = cambios.total ?? Number(actual.total);
    if (total < totalPagado) throw new ErrorCupo(`El total no puede ser menor a lo ya pagado ($${totalPagado})`, 400);
    const saldo = Math.round((total - totalPagado) * 100) / 100;
    return tx.reservaTour.update({
      where: { id },
      data: {
        estado: saldo === 0 && estado !== "cancelada" && totalPagado > 0 ? "liquidada" : estado,
        viajeros,
        total,
        saldo,
        ...(cambios.notas !== undefined ? { notas: cambios.notas } : {}),
        ...(cambios.fechaSalida !== undefined ? { fechaSalida: cambios.fechaSalida } : {}),
      },
    });
  });
}

/** Una reserva con pagos aplicados no se borra (es historial de dinero): se cancela. */
export function borrarReserva(orgId: bigint, id: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    await bloquear(tx, "reservas_tour", id);
    const pagos = await tx.pagoTour.count({ where: { reservaId: id, estado: "aplicado" } });
    if (pagos > 0) throw new ErrorCupo("La reserva tiene pagos: cámbiala a «Cancelada» en lugar de borrarla");
    return tx.reservaTour.delete({ where: { id } });
  });
}

/** Cancelar un pago devuelve su monto al saldo de la reserva. Los pagos no se borran. */
export function cancelarPagoTour(orgId: bigint, id: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    const pago = await tx.pagoTour.findUnique({ where: { id } });
    if (!pago) throw new ErrorCupo("Pago no encontrado", 404);
    await bloquear(tx, "reservas_tour", pago.reservaId);
    const vigente = await tx.pagoTour.findUniqueOrThrow({ where: { id } });
    if (vigente.estado === "cancelado") throw new ErrorCupo("El pago ya estaba cancelado", 400);
    const reserva = await tx.reservaTour.findUniqueOrThrow({ where: { id: pago.reservaId } });
    await tx.pagoTour.update({ where: { id }, data: { estado: "cancelado" } });
    return tx.reservaTour.update({
      where: { id: reserva.id },
      data: {
        saldo: Math.round((Number(reserva.saldo) + Number(vigente.monto)) * 100) / 100,
        estado: reserva.estado === "liquidada" ? "confirmada" : reserva.estado,
      },
    });
  });
}

/** El cupo de un curso no puede quedar por debajo de las inscripciones activas. */
export function actualizarCurso(orgId: bigint, id: bigint, data: Prisma.CursoAcademiaUpdateInput & { capacidad: number }) {
  return transaccionTenant(orgId, async (tx) => {
    await bloquear(tx, "cursos_academia", id);
    const activas = await tx.inscripcionAcademia.count({ where: { cursoId: id, estado: "activa" } });
    if (data.capacidad < activas) {
      throw new ErrorCupo(`El cupo no puede ser menor a las ${activas} inscripciones activas`);
    }
    return tx.cursoAcademia.update({ where: { id }, data });
  });
}

/** Reactivar una inscripción vuelve a ocupar lugar: se revisa el cupo con el curso bloqueado. */
export function actualizarInscripcion(
  orgId: bigint,
  id: bigint,
  cambios: { estado?: string; avance?: number; descuento?: number; notas?: string | null },
) {
  return transaccionTenant(orgId, async (tx) => {
    const previa = await tx.inscripcionAcademia.findUnique({ where: { id }, select: { cursoId: true } });
    if (!previa) throw new ErrorCupo("Inscripción no encontrada", 404);
    await bloquear(tx, "cursos_academia", previa.cursoId);
    const actual = await tx.inscripcionAcademia.findUniqueOrThrow({ where: { id }, include: { curso: true } });
    if (cambios.estado === "activa" && actual.estado !== "activa") {
      const activas = await tx.inscripcionAcademia.count({ where: { cursoId: actual.cursoId, estado: "activa" } });
      if (activas >= actual.curso.capacidad) throw new ErrorCupo("El curso está lleno");
    }
    return tx.inscripcionAcademia.update({ where: { id }, data: cambios });
  });
}
