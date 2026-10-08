import { NextRequest, NextResponse } from "next/server";
import { ErrorCupo, reservarTourConCupo } from "@/lib/cupos-db";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { validarReservaTour } from "@/lib/viajes";
import { conModulo } from "@/lib/con-modulo";
import { paginacionListado } from "@/lib/paginacion";

export const GET = conModulo("reservas_tours", {}, async (sesion, req: NextRequest) => {
  const reservas = await db.reservaTour.findMany({
    include: { tour: true, contacto: true }, orderBy: { createdAt: "desc" },
    ...paginacionListado(req),
  });
  return NextResponse.json(serializar({ reservas }));
});

export const POST = conModulo("reservas_tours", {}, async (sesion, req: NextRequest) => {
  if (sesion.orgId === null) {
    return NextResponse.json({ error: "Organización no disponible" }, { status: 400 });
  }
  const validacion = validarReservaTour(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    const reserva = await reservarTourConCupo(sesion.orgId, validacion.data);
    return NextResponse.json(serializar({ reserva }), { status: 201 });
  } catch (error) {
    if (error instanceof ErrorCupo) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
});
