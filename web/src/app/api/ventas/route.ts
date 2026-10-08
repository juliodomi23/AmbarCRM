import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  estadoUsaInventario,
  folioVenta,
  validarVenta,
} from "@/lib/retail";
import { bloquearProductos, ErrorRetail, transaccionTenant } from "@/lib/retail-db";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";

export const GET = conModulo("ventas", {}, async (sesion) => {
  const ventas = await db.venta.findMany({
    include: {
      contacto: { select: { id: true, nombre: true, telefono: true } },
      creadoPor: { select: { id: true, nombre: true } },
      partidas: { include: { producto: { select: { id: true, nombre: true, sku: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(serializar({ ventas }));
});

export const POST = conModulo("ventas", {}, async (sesion, req: NextRequest) => {
  if (sesion.orgId === null) {
    return NextResponse.json({ error: "Organización no disponible" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const validacion = validarVenta(body);
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }

  try {
    const venta = await transaccionTenant(sesion.orgId, async (tx) => {
      const { partidas, contactoId, descuento, ...cabecera } = validacion.data;
      if (contactoId) {
        const contacto = await tx.contacto.findUnique({ where: { id: contactoId } });
        if (!contacto) throw new ErrorRetail("El cliente no existe");
      }
      await bloquearProductos(
        tx,
        partidas.map((partida) => partida.productoId),
      );
      const productos = await tx.producto.findMany({
        where: { id: { in: partidas.map((partida) => partida.productoId) }, activo: true },
      });
      if (productos.length !== partidas.length) {
        throw new ErrorRetail("Uno de los productos no existe o está inactivo");
      }
      const porId = new Map(productos.map((producto) => [String(producto.id), producto]));
      const subtotal = partidas.reduce((suma, partida) => {
        const producto = porId.get(String(partida.productoId));
        return suma + Number(producto?.precio ?? 0) * partida.cantidad;
      }, 0);
      if (descuento > subtotal) throw new ErrorRetail("El descuento no puede superar el subtotal");
      const aplicaStock = estadoUsaInventario(cabecera.estado);
      if (aplicaStock) {
        for (const partida of partidas) {
          const producto = porId.get(String(partida.productoId));
          if (!producto || producto.stock < partida.cantidad) {
            throw new ErrorRetail(`No hay existencias suficientes de ${producto?.nombre ?? "un producto"}`);
          }
        }
      }

      const creada = await tx.venta.create({
        data: {
          ...cabecera,
          folio: folioVenta(),
          contactoId,
          creadoPorId: sesion.userId,
          subtotal,
          descuento,
          total: subtotal - descuento,
          stockAplicado: aplicaStock,
        },
      });
      for (const partida of partidas) {
        const producto = porId.get(String(partida.productoId));
        if (!producto) continue;
        await tx.ventaPartida.create({
          data: {
            ventaId: creada.id,
            productoId: producto.id,
            cantidad: partida.cantidad,
            precioUnitario: producto.precio,
            total: Number(producto.precio) * partida.cantidad,
          },
        });
        if (aplicaStock) {
          const existenciaDespues = producto.stock - partida.cantidad;
          await tx.producto.update({ where: { id: producto.id }, data: { stock: existenciaDespues } });
          await tx.movimientoInventario.create({
            data: {
              productoId: producto.id,
              ventaId: creada.id,
              usuarioId: sesion.userId,
              tipo: "venta",
              cantidad: -partida.cantidad,
              existenciaAntes: producto.stock,
              existenciaDespues,
              motivo: `Venta ${creada.folio}`,
            },
          });
        }
      }
      return tx.venta.findUniqueOrThrow({
        where: { id: creada.id },
        include: { contacto: true, partidas: { include: { producto: true } } },
      });
    });
    return NextResponse.json(serializar({ venta }), { status: 201 });
  } catch (error) {
    if (error instanceof ErrorRetail) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "No se pudo generar un folio único" }, { status: 409 });
    }
    throw error;
  }
});
