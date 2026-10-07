import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";
import { validarVehiculo } from "@/lib/vehiculos";

function errorUnico(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function GET() {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("automotriz");
  if (apagado) return apagado;
  const vehiculos = await db.vehiculo.findMany({
    orderBy: [{ estado: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(serializar({ vehiculos }));
}

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("automotriz");
  if (apagado) return apagado;
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
}

