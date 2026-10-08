import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireModuloActivo } from "@/lib/modulos";
import { validarProducto } from "@/lib/retail";
import { transaccionTenant } from "@/lib/retail-db";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

function conflictoUnico(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function GET() {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("productos");
  if (apagado) return apagado;
  const productos = await db.producto.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }] });
  return NextResponse.json(serializar({ productos }));
}

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("productos");
  if (apagado) return apagado;
  if (sesion.orgId === null) {
    return NextResponse.json({ error: "Organización no disponible" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const validacion = validarProducto(body);
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }

  try {
    const producto = await transaccionTenant(sesion.orgId, async (tx) => {
      const creado = await tx.producto.create({ data: validacion.data });
      if (creado.stock > 0) {
        await tx.movimientoInventario.create({
          data: {
            productoId: creado.id,
            usuarioId: sesion.userId,
            tipo: "entrada",
            cantidad: creado.stock,
            existenciaAntes: 0,
            existenciaDespues: creado.stock,
            motivo: "Existencia inicial",
          },
        });
      }
      return creado;
    });
    return NextResponse.json(serializar({ producto }), { status: 201 });
  } catch (error) {
    if (conflictoUnico(error)) {
      return NextResponse.json(
        { error: "El SKU o código de barras ya está registrado" },
        { status: 409 },
      );
    }
    throw error;
  }
}
