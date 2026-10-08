import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validarSucursalLegal } from "@/lib/legal";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";

/** Alta de sucursal del despacho (solo administradores). */
export const POST = conModulo("operacion_legal", { admin: true }, async (_sesion, req: NextRequest) => {
  const validacion = validarSucursalLegal(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    const sucursal = await db.sucursalLegal.create({ data: validacion.data });
    return NextResponse.json(serializar({ sucursal }), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ya existe una sucursal con ese nombre" }, { status: 409 });
    }
    throw error;
  }
});
