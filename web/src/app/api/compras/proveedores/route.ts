import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validarProveedor } from "@/lib/retail";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";
import { paginacionListado } from "@/lib/paginacion";

export const GET = conModulo("compras", {}, async (sesion, req: NextRequest) => {
  const proveedores = await db.proveedor.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    ...paginacionListado(req),
  });
  return NextResponse.json(serializar({ proveedores }));
});

export const POST = conModulo("compras", {}, async (sesion, req: NextRequest) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const validacion = validarProveedor(body);
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  try {
    const proveedor = await db.proveedor.create({ data: validacion.data });
    return NextResponse.json(serializar({ proveedor }), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ya existe un proveedor con ese nombre" }, { status: 409 });
    }
    throw error;
  }
});
