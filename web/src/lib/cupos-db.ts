import { Prisma } from "@prisma/client";
import { dbRaw } from "@/lib/db";

export class ErrorCupo extends Error {
  readonly status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

async function transaccionTenant<T>(
  orgId: bigint,
  operacion: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return dbRaw.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org', ${String(orgId)}, true)`;
    return operacion(tx);
  });
}

export function reservarTourConCupo(
  orgId: bigint,
  data: Prisma.ReservaTourUncheckedCreateInput,
) {
  return transaccionTenant(orgId, async (tx) => {
    const bloqueado = await tx.$queryRaw<Array<{ id: bigint }>>`
      SELECT id
      FROM tours
      WHERE id = ${data.tourId}
      FOR UPDATE
    `;
    if (bloqueado.length === 0) throw new ErrorCupo("Tour no encontrado", 404);

    const tour = await tx.tour.findUnique({
      where: { id: BigInt(data.tourId) },
      select: { capacidad: true },
    });
    if (!tour) throw new ErrorCupo("Tour no encontrado", 404);

    const ocupacion = await tx.reservaTour.aggregate({
      where: {
        tourId: BigInt(data.tourId),
        estado: { notIn: ["cancelada", "reembolsada"] },
      },
      _sum: { viajeros: true },
    });
    const viajeros = Number(data.viajeros ?? 1);
    if ((ocupacion._sum.viajeros ?? 0) + viajeros > tour.capacidad) {
      throw new ErrorCupo("No hay cupo suficiente");
    }
    return tx.reservaTour.create({ data });
  });
}

export function inscribirAlumnoConCupo(
  orgId: bigint,
  data: Prisma.InscripcionAcademiaUncheckedCreateInput,
) {
  return transaccionTenant(orgId, async (tx) => {
    const bloqueado = await tx.$queryRaw<Array<{ id: bigint }>>`
      SELECT id
      FROM cursos_academia
      WHERE id = ${data.cursoId}
      FOR UPDATE
    `;
    if (bloqueado.length === 0) throw new ErrorCupo("Curso no encontrado", 404);

    const curso = await tx.cursoAcademia.findUnique({
      where: { id: BigInt(data.cursoId) },
      select: { capacidad: true },
    });
    if (!curso) throw new ErrorCupo("Curso no encontrado", 404);

    const activos = await tx.inscripcionAcademia.count({
      where: { cursoId: BigInt(data.cursoId), estado: "activa" },
    });
    if (activos >= curso.capacidad) throw new ErrorCupo("El curso está lleno");
    return tx.inscripcionAcademia.create({ data });
  });
}

export function registrarPagoTourConSaldo(
  orgId: bigint,
  data: Prisma.PagoTourUncheckedCreateInput,
) {
  return transaccionTenant(orgId, async (tx) => {
    const bloqueado = await tx.$queryRaw<Array<{ id: bigint }>>`
      SELECT id
      FROM reservas_tour
      WHERE id = ${data.reservaId}
      FOR UPDATE
    `;
    if (bloqueado.length === 0) throw new ErrorCupo("Reserva no encontrada", 404);

    const reserva = await tx.reservaTour.findUnique({ where: { id: BigInt(data.reservaId) } });
    if (!reserva) throw new ErrorCupo("Reserva no encontrada", 404);
    const monto = Number(data.monto);
    if (monto > Number(reserva.saldo)) {
      throw new ErrorCupo("El pago supera el saldo pendiente", 400);
    }

    const pago = await tx.pagoTour.create({ data });
    const saldo = Number(reserva.saldo) - monto;
    await tx.reservaTour.update({
      where: { id: reserva.id },
      data: { saldo, estado: saldo === 0 ? "liquidada" : reserva.estado },
    });
    return pago;
  });
}
