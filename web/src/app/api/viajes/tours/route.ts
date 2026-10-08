import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";
import { validarTour } from "@/lib/viajes";

export async function GET() {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("tours");
  if (apagado) return apagado;
  return NextResponse.json(serializar({ tours: await db.tour.findMany({ orderBy: { fechaSalida: "asc" } }) }));
}

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("tours");
  if (apagado) return apagado;
  const validacion = validarTour(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    return NextResponse.json(
      serializar({ tour: await db.tour.create({ data: validacion.data }) }),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "La clave ya está registrada" }, { status: 409 });
    }
    throw error;
  }
}
