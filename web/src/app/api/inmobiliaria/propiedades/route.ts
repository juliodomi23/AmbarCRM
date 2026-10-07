import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireModuloActivo } from "@/lib/modulos";
import { validarPropiedad } from "@/lib/propiedades";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function GET() {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("inmobiliaria");
  if (apagado) return apagado;
  const propiedades = await db.propiedad.findMany({
    orderBy: [{ estado: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(serializar({ propiedades }));
}

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("inmobiliaria");
  if (apagado) return apagado;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const validacion = validarPropiedad(body);
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  try {
    const propiedad = await db.propiedad.create({ data: validacion.data });
    return NextResponse.json(serializar({ propiedad }), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "La clave ya está registrada" }, { status: 409 });
    }
    throw error;
  }
}

