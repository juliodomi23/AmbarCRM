import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { referenciaAjena } from "@/lib/referencias";
import { transaccionTenant } from "@/lib/retail-db";
import { validarServicioReserva } from "@/lib/reservas/validar";
import { fusionar, idDeRuta, noEncontrado, type PropsId } from "@/lib/rutas-edicion";
import { serializar } from "@/lib/serialize";

export const PATCH = conModulo("reservas_en_linea", { admin: true }, async (sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  const actual = id
    ? await db.servicioReserva.findFirst({ where: { id }, include: { doctores: { select: { doctorId: true } } } })
    : null;
  if (!id || !actual) return noEncontrado();
  const { doctores, ...guardado } = actual;
  const validacion = validarServicioReserva(
    fusionar({ ...guardado, doctorIds: doctores.map((d) => String(d.doctorId)).join(",") }, await req.json().catch(() => ({}))),
  );
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  for (const doctorId of validacion.doctorIds) {
    if (await referenciaAjena({ doctorId }, { doctorId: "doctor" })) {
      return NextResponse.json({ error: "especialista inexistente" }, { status: 400 });
    }
  }
  const servicio = await transaccionTenant(sesion.orgId!, async (tx) => {
    const editado = await tx.servicioReserva.update({ where: { id }, data: validacion.data });
    await tx.servicioReservaDoctor.deleteMany({ where: { servicioId: id } });
    await tx.servicioReservaDoctor.createMany({ data: validacion.doctorIds.map((doctorId) => ({ servicioId: id, doctorId })) });
    return editado;
  });
  return NextResponse.json(serializar({ servicio }));
});

export const DELETE = conModulo("reservas_en_linea", { admin: true }, async (_sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id || !(await db.servicioReserva.findFirst({ where: { id }, select: { id: true } }))) return noEncontrado();
  if (await db.cita.count({ where: { servicioId: id } })) {
    return NextResponse.json({ error: "El servicio ya tiene citas: desactívalo en lugar de borrarlo" }, { status: 409 });
  }
  await db.servicioReserva.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
