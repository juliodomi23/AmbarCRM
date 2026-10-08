import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireModuloActivo } from "@/lib/modulos";
import { compraUsaInventario, folioCompra, validarCompra } from "@/lib/retail";
import { bloquearProductos, ErrorRetail, transaccionTenant } from "@/lib/retail-db";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function GET() {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("compras");
  if (apagado) return apagado;
  const compras = await db.compra.findMany({
    include: {
      proveedor: true,
      creadoPor: { select: { id: true, nombre: true } },
      partidas: { include: { producto: { select: { id: true, nombre: true, sku: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(serializar({ compras }));
}

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("compras");
  if (apagado) return apagado;
  if (sesion.orgId === null) {
    return NextResponse.json({ error: "Organización no disponible" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const validacion = validarCompra(body);
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }

  try {
    const compra = await transaccionTenant(sesion.orgId, async (tx) => {
      const { proveedorId, partidas, ...cabecera } = validacion.data;
      const proveedor = await tx.proveedor.findUnique({ where: { id: proveedorId } });
      if (!proveedor?.activo) throw new ErrorRetail("El proveedor no existe o está inactivo");
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
      const total = partidas.reduce(
        (suma, partida) => suma + partida.costoUnitario * partida.cantidad,
        0,
      );
      const aplicaStock = compraUsaInventario(cabecera.estado);
      const creada = await tx.compra.create({
        data: {
          ...cabecera,
          proveedorId,
          creadoPorId: sesion.userId,
          folio: folioCompra(),
          total,
          stockAplicado: aplicaStock,
        },
      });
      for (const partida of partidas) {
        const producto = porId.get(String(partida.productoId));
        if (!producto) continue;
        await tx.compraPartida.create({
          data: {
            compraId: creada.id,
            productoId: producto.id,
            cantidad: partida.cantidad,
            costoUnitario: partida.costoUnitario,
            total: partida.costoUnitario * partida.cantidad,
          },
        });
        if (aplicaStock) {
          const existenciaDespues = producto.stock + partida.cantidad;
          await tx.producto.update({
            where: { id: producto.id },
            data: { stock: existenciaDespues, costo: partida.costoUnitario },
          });
          await tx.movimientoInventario.create({
            data: {
              productoId: producto.id,
              compraId: creada.id,
              usuarioId: sesion.userId,
              tipo: "compra",
              cantidad: partida.cantidad,
              existenciaAntes: producto.stock,
              existenciaDespues,
              motivo: `Compra ${creada.folio}`,
            },
          });
        }
      }
      return tx.compra.findUniqueOrThrow({
        where: { id: creada.id },
        include: { proveedor: true, partidas: { include: { producto: true } } },
      });
    });
    return NextResponse.json(serializar({ compra }), { status: 201 });
  } catch (error) {
    if (error instanceof ErrorRetail) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "No se pudo generar un folio único" }, { status: 409 });
    }
    throw error;
  }
}
