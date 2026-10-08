import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validarPropiedad } from "@/lib/propiedades";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";
import { paginacionListado } from "@/lib/paginacion";

export const GET = conModulo("inmobiliaria", {}, async (sesion, req: NextRequest) => {
  const propiedades = await db.propiedad.findMany({
    orderBy: [{ estado: "asc" }, { createdAt: "desc" }],
    ...paginacionListado(req),
  });
  return NextResponse.json(serializar({ propiedades }));
});

export const POST = conModulo("inmobiliaria", {}, async (sesion, req: NextRequest) => {
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
});
