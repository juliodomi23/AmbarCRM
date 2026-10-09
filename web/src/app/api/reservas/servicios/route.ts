import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { referenciaAjena } from "@/lib/referencias";
import { transaccionTenant } from "@/lib/retail-db";
import { validarServicioReserva } from "@/lib/reservas/validar";
import { serializar } from "@/lib/serialize";

/** Alta de servicio agendable. Body: { nombre, duracionMin, bufferMin?, precio?, descripcion?, doctorIds: "1,2" } */
export const POST = conModulo("reservas_en_linea", { admin: true }, async (sesion, req: NextRequest) => {
  const validacion = validarServicioReserva(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  for (const doctorId of validacion.doctorIds) {
    if (await referenciaAjena({ doctorId }, { doctorId: "doctor" })) {
      return NextResponse.json({ error: "especialista inexistente" }, { status: 400 });
    }
  }
  const servicio = await transaccionTenant(sesion.orgId!, async (tx) => {
    const creado = await tx.servicioReserva.create({ data: validacion.data });
    await tx.servicioReservaDoctor.createMany({
      data: validacion.doctorIds.map((doctorId) => ({ servicioId: creado.id, doctorId })),
    });
    return creado;
  });
  return NextResponse.json(serializar({ servicio }), { status: 201 });
});
