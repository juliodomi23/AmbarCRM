import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  CERO_DECIMAL,
  estadoUsaInventario,
  folioVenta,
  validarVenta,
} from "@/lib/retail";
import { calcularPrecios } from "@/lib/precios-db";
import { cantidadValidaParaProducto } from "@/lib/cantidad";
import { bloquearProductos, ErrorRetail, reservasActivasPorProducto, transaccionTenant } from "@/lib/retail-db";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";

export const GET = conModulo("ventas", {}, async (sesion) => {
  const ventas = await db.venta.findMany({
    include: {
      contacto: { select: { id: true, nombre: true, telefono: true } },
      creadoPor: { select: { id: true, nombre: true } },
      partidas: { include: { producto: { select: { id: true, nombre: true, sku: true, unidad: true } } } },
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
      const precios = await calcularPrecios(tx, partidas, { contactoId });
      const porId = new Map(precios.map((precio) => [String(precio.producto.id), precio]));
      const reservadas = await reservasActivasPorProducto(tx, partidas.map((partida) => partida.productoId));
      const subtotal = partidas.reduce((suma, partida) => {
        const calculo = porId.get(String(partida.productoId));
        if (!calculo) return suma;
        if (!cantidadValidaParaProducto(partida.cantidad, calculo.producto.vendePorPeso)) {
          throw new ErrorRetail(`${calculo.producto.nombre} se vende por piezas enteras`);
        }
        return suma.plus(calculo.bruto);
      }, CERO_DECIMAL);
      const descuentoPromociones = precios.reduce((suma, precio) => suma.plus(precio.descuentoPromocion), CERO_DECIMAL);
      if (descuento.gt(subtotal.minus(descuentoPromociones))) throw new ErrorRetail("El descuento no puede superar el subtotal");
      const aplicaStock = estadoUsaInventario(cabecera.estado);
      if (aplicaStock) {
        for (const partida of partidas) {
          const calculo = porId.get(String(partida.productoId));
          const producto = calculo?.producto;
          if (!producto || producto.stock.minus(reservadas.get(String(partida.productoId)) ?? 0).lt(partida.cantidad)) {
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
          descuento: descuento.plus(descuentoPromociones),
          total: subtotal.minus(descuento).minus(descuentoPromociones),
          stockAplicado: aplicaStock,
        },
      });
      for (const partida of partidas) {
        const calculo = porId.get(String(partida.productoId));
        if (!calculo) continue;
        const producto = calculo.producto;
        await tx.ventaPartida.create({
          data: {
            ventaId: creada.id,
            productoId: producto.id,
            cantidad: partida.cantidad,
            precioUnitario: calculo.precioUnitario,
            costoUnitario: aplicaStock ? producto.costo : null,
            descuento: calculo.descuentoPromocion,
            descuentoPromocion: calculo.descuentoPromocion,
            promocionDescripcion: calculo.promocionDescripcion,
            total: calculo.total,
          },
        });
        if (aplicaStock) {
          const existenciaDespues = producto.stock.minus(partida.cantidad);
          await tx.producto.update({ where: { id: producto.id }, data: { stock: existenciaDespues } });
          await tx.movimientoInventario.create({
            data: {
              productoId: producto.id,
              ventaId: creada.id,
              usuarioId: sesion.userId,
              tipo: "venta",
              cantidad: partida.cantidad.neg(),
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
