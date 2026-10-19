import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo, type SesionModulo } from "@/lib/con-modulo";
import { conErroresCita, ErrorCita } from "@/lib/citas-servidor";
import { bloquearAgenda } from "@/lib/reservas/servidor";
import { referenciaAjena } from "@/lib/referencias";
import { transaccionTenant } from "@/lib/retail-db";
import { validarServicioReserva } from "@/lib/reservas/validar";
import { fusionar, idDeRuta, noEncontrado, type PropsId } from "@/lib/rutas-edicion";
import { serializar } from "@/lib/serialize";

export const PATCH = conModulo("reservas_en_linea", { admin: true }, conErroresCita(async (sesion: SesionModulo, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  const actual = id && id <= 9223372036854775807n
    ? await db.servicioReserva.findFirst({ where: { id }, include: { doctores: { select: { doctorId: true } } } })
    : null;
  if (!id || !actual) return noEncontrado();
  const cambios = await req.json().catch(() => null);
  if (!cambios || typeof cambios !== "object" || Array.isArray(cambios)) return NextResponse.json({ error: "Datos de servicio inválidos" }, { status: 400 });
  const { doctores, ...guardado } = actual;
  const validacion = validarServicioReserva(
    fusionar({ ...guardado, doctorIds: doctores.map((d) => String(d.doctorId)).join(",") }, cambios),
  );
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  for (const doctorId of validacion.doctorIds) {
    if (await referenciaAjena({ doctorId }, { doctorId: "doctor" })) {
      return NextResponse.json({ error: "especialista inexistente" }, { status: 400 });
    }
  }
  const servicio = await transaccionTenant(sesion.orgId!, async (tx) => {
    await bloquearAgenda(tx, [...doctores.map((d) => d.doctorId), ...validacion.doctorIds]);
    await tx.$queryRaw`SELECT id FROM servicios_reserva WHERE id = ${id} FOR UPDATE`;
    const vigente = await tx.servicioReserva.findFirst({ where: { id } });
    if (!vigente) throw new ErrorCita("Servicio inexistente", 404);
    if ((vigente.duracionMin !== validacion.data.duracionMin || vigente.bufferMin !== validacion.data.bufferMin) && await tx.cita.count({ where: { servicioId: id } })) {
      throw new ErrorCita("Este servicio ya tiene citas. Crea otro servicio para cambiar su duración o margen sin alterar las citas existentes", 409);
    }
    const editado = await tx.servicioReserva.update({ where: { id }, data: validacion.data });
    await tx.servicioReservaDoctor.deleteMany({ where: { servicioId: id } });
    await tx.servicioReservaDoctor.createMany({ data: validacion.doctorIds.map((doctorId) => ({ servicioId: id, doctorId })) });
    return editado;
  });
  return NextResponse.json(serializar({ servicio }));
}));

export const DELETE = conModulo("reservas_en_linea", { admin: true }, conErroresCita(async (sesion: SesionModulo, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  const actual = id && id <= 9223372036854775807n ? await db.servicioReserva.findFirst({ where: { id }, include: { doctores: true } }) : null;
  if (!id || !actual) return noEncontrado();
  await transaccionTenant(sesion.orgId!, async (tx) => {
    await bloquearAgenda(tx, actual.doctores.map((d) => d.doctorId));
    await tx.$queryRaw`SELECT id FROM servicios_reserva WHERE id = ${id} FOR UPDATE`;
    if (await tx.cita.count({ where: { servicioId: id } })) throw new ErrorCita("El servicio ya tiene citas: desactívalo en lugar de borrarlo", 409);
    await tx.servicioReserva.deleteMany({ where: { id } });
  });
  return NextResponse.json({ ok: true });
}));
