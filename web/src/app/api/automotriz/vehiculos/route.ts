import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { validarVehiculo } from "@/lib/vehiculos";
import { conModulo } from "@/lib/con-modulo";
import { paginacionListado } from "@/lib/paginacion";

function errorUnico(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const GET = conModulo("automotriz", {}, async (sesion, req: NextRequest) => {
  const vehiculos = await db.vehiculo.findMany({
    orderBy: [{ estado: "asc" }, { createdAt: "desc" }],
    ...paginacionListado(req),
  });
  return NextResponse.json(serializar({ vehiculos }));
});

export const POST = conModulo("automotriz", {}, async (sesion, req: NextRequest) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const validacion = validarVehiculo(body);
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  try {
    const vehiculo = await db.vehiculo.create({ data: validacion.data });
    return NextResponse.json(serializar({ vehiculo }), { status: 201 });
  } catch (error) {
    if (errorUnico(error)) {
      return NextResponse.json(
        { error: "El número de stock o VIN ya está registrado" },
        { status: 409 },
      );
    }
    throw error;
  }
});
