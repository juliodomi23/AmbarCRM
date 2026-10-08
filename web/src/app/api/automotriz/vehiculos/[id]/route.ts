import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";
import { validarVehiculo } from "@/lib/vehiculos";
import { conModulo } from "@/lib/con-modulo";

export const PATCH = conModulo(
  "automotriz",
  {},
  async (sesion, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const id = aBigInt((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "Vehículo inválido" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const actual = await db.vehiculo.findUnique({ where: { id } });
  if (!actual) {
    return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
  }
  const validacion = validarVehiculo({ ...serializar(actual), ...body });
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  try {
    const vehiculo = await db.vehiculo.update({
      where: { id },
      data: validacion.data,
    });
    return NextResponse.json(serializar({ vehiculo }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "El número de stock o VIN ya está registrado" },
        { status: 409 },
      );
    }
    throw error;
  }
  },
);
