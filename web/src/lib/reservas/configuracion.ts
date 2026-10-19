import { transaccionTenant } from "@/lib/retail-db";
import { bloquearAgenda } from "@/lib/reservas/servidor";
import { ErrorCita } from "@/lib/citas-servidor";

type Horario = { doctorId: bigint; diaSemana: number; inicioMin: number; finMin: number };
type Excepcion = { doctorId: bigint; fecha: Date; inicioMin: number | null; finMin: number | null; motivo: string | null };

export function crearHorarioDoctor(orgId: bigint, datos: Horario) {
  return transaccionTenant(orgId, async (tx) => {
    if (!(await bloquearAgenda(tx, [datos.doctorId])).length) throw new ErrorCita("Especialista inexistente");
    const empalme = await tx.horarioDoctor.count({ where: {
      doctorId: datos.doctorId, diaSemana: datos.diaSemana,
      inicioMin: { lt: datos.finMin }, finMin: { gt: datos.inicioMin },
    } });
    if (empalme) throw new ErrorCita("Ese horario se empalma con otro del mismo día", 409);
    return tx.horarioDoctor.create({ data: datos });
  });
}

export function crearExcepcionDoctor(orgId: bigint, datos: Excepcion) {
  return transaccionTenant(orgId, async (tx) => {
    if (!(await bloquearAgenda(tx, [datos.doctorId])).length) throw new ErrorCita("Especialista inexistente");
    const existentes = await tx.excepcionHorario.findMany({ where: { doctorId: datos.doctorId, fecha: datos.fecha } });
    if (existentes.some((e) => e.inicioMin === null || e.finMin === null) || (datos.inicioMin === null && existentes.length)) {
      throw new ErrorCita("Ese día ya tiene una excepción. Quita la anterior antes de cambiar entre cierre y horario especial", 409);
    }
    if (existentes.some((e) => e.inicioMin! < datos.finMin! && datos.inicioMin! < e.finMin!)) {
      throw new ErrorCita("Ese horario especial se empalma con otro de la misma fecha", 409);
    }
    return tx.excepcionHorario.create({ data: datos });
  });
}

export function quitarHorarioDoctor(orgId: bigint, id: bigint, tipo: "semanal" | "excepcion") {
  return transaccionTenant(orgId, async (tx) => {
    const actual = tipo === "semanal"
      ? await tx.horarioDoctor.findFirst({ where: { id }, select: { doctorId: true } })
      : await tx.excepcionHorario.findFirst({ where: { id }, select: { doctorId: true } });
    if (!actual) return false;
    await bloquearAgenda(tx, [actual.doctorId]);
    const resultado = tipo === "semanal" ? await tx.horarioDoctor.deleteMany({ where: { id } }) : await tx.excepcionHorario.deleteMany({ where: { id } });
    return resultado.count > 0;
  });
}
