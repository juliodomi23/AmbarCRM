import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { validarProducto } from "@/lib/retail";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";

export const PATCH = conModulo(
  "productos",
  {},
  async (sesion, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const id = aBigInt((await params).id);
  if (id === null) return NextResponse.json({ error: "Producto inválido" }, { status: 400 });

  const actual = await db.producto.findUnique({ where: { id } });
  if (!actual) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const validacion = validarProducto({ ...serializar(actual), ...body, stock: actual.stock });
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  if (String(validacion.data.ivaTasa) === "0.08" && !actual.ivaTasa.eq("0.08")) {
    const moduloVentas = await db.moduloOrg.findFirst({ where: { clave: "ventas", activo: true }, select: { config: true } });
    const config = moduloVentas?.config as Record<string, unknown> | null;
    if (config?.iva8Habilitado !== true) return NextResponse.json({ error: "El IVA al 8 % debe habilitarlo un administrador en Configuración de ventas" }, { status: 400 });
  }

  // La existencia solo cambia por ventas, compras y movimientos (con bloqueo). Si la edición
  // la guardara, regresaría a un valor viejo cualquier venta hecha mientras se editaba.
  const { stock: _existencia, ...datos } = validacion.data;
  if (datos.grupoId === id) return NextResponse.json({ error: "Un producto no puede ser su propio padre" }, { status: 400 });
  if (datos.grupoId && !(await db.producto.findUnique({ where: { id: datos.grupoId } }))) {
    return NextResponse.json({ error: "El producto padre no pertenece a la empresa" }, { status: 404 });
  }
  try {
    const producto = await db.producto.update({ where: { id }, data: datos });
    return NextResponse.json(serializar({ producto }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "El SKU o código de barras ya está registrado" },
        { status: 409 },
      );
    }
    throw error;
  }
  },
);
