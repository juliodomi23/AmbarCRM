import { NextRequest, NextResponse } from "next/server";
import { ErrorCupo, reservarTourConCupo } from "@/lib/cupos-db";
import { db } from "@/lib/db";
import { requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";
import { validarReservaTour } from "@/lib/viajes";

export async function GET() {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("reservas_tours");
  if (apagado) return apagado;
  const reservas = await db.reservaTour.findMany({
    include: { tour: true, contacto: true }, orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(serializar({ reservas }));
}

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("reservas_tours");
  if (apagado) return apagado;
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
}
