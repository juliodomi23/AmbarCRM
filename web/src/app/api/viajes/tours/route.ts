import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { validarTour } from "@/lib/viajes";
import { conModulo } from "@/lib/con-modulo";
import { paginacionListado } from "@/lib/paginacion";

export const GET = conModulo("tours", {}, async (sesion, req: NextRequest) => {
  const tours = await db.tour.findMany({
    orderBy: { fechaSalida: "asc" },
    ...paginacionListado(req),
  });
  return NextResponse.json(serializar({ tours }));
});

export const POST = conModulo("tours", {}, async (sesion, req: NextRequest) => {
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
});
