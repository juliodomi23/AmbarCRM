import { NextRequest, NextResponse } from "next/server";
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
  const validacion = validarReservaTour(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const tour = await db.tour.findUnique({
    where: { id: validacion.data.tourId }, include: { reservas: true },
  });
  if (!tour) return NextResponse.json({ error: "Tour no encontrado" }, { status: 404 });
  const ocupados = tour.reservas
    .filter((reserva) => !["cancelada", "reembolsada"].includes(reserva.estado))
    .reduce((suma, reserva) => suma + reserva.viajeros, 0);
  if (ocupados + validacion.data.viajeros > tour.capacidad) {
    return NextResponse.json({ error: "No hay cupo suficiente" }, { status: 409 });
  }
  const reserva = await db.reservaTour.create({ data: validacion.data });
  return NextResponse.json(serializar({ reserva }), { status: 201 });
}
