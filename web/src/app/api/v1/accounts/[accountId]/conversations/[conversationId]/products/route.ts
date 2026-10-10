import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conBot, conversacionDelBot } from "@/lib/bot-auth";
import { db } from "@/lib/db";
import { conErrores } from "@/lib/errores-api";
import { productosQueCoinciden } from "@/lib/busqueda";
import { moduloHabilitado } from "@/lib/modulos";
import { calcularPrecios } from "@/lib/precios-db";
import { reservasActivasPorProducto, transaccionTenant } from "@/lib/retail-db";

export const dynamic = "force-dynamic";

const LIMITE_DEFECTO = 10;
const LIMITE_MAXIMO = 50;

/**
 * Busca productos (y servicios agendables) por nombre, SKU o categoría. Solo lectura.
 * GET …/products?q=&limit=
 * `existencia` es lo vendible ahora: stock (que ya descuenta apartados) menos pedidos web pendientes;
 * `apartada` solo informa cuánto está comprometido en apartados activos. `precio` es el que se cobraría
 * a este cliente (lista de precios y promoción vigente, 1 unidad).
 */
async function manejarGET(req: NextRequest, props: { params: Promise<{ accountId: string; conversationId: string }> }) {
  const { conversationId } = await props.params;
  return conBot(req, "ver_productos", async (botAutenticado) => {
    const acceso = await conversacionDelBot(botAutenticado, conversationId, "productos");
    if (!acceso.conv) return acceso.respuesta;

    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
    const limiteTexto = req.nextUrl.searchParams.get("limit");
    const limite = limiteTexto === null ? LIMITE_DEFECTO : Number(limiteTexto);
    if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAXIMO) {
      return NextResponse.json({ error: `limit debe ser un entero de 1 a ${LIMITE_MAXIMO}` }, { status: 400 });
    }

    const ids = await productosQueCoinciden(q, limite);
    const productos = ids.length ? await db.producto.findMany({ where: { id: { in: ids }, activo: true }, orderBy: { nombre: "asc" } }) : [];
    const { reservadas, precios } = await transaccionTenant(botAutenticado.orgId, async (tx) => {
      const idsActivos = productos.map((p) => p.id);
      if (!idsActivos.length) return { reservadas: new Map(), precios: new Map() };
      const calculados = await calcularPrecios(
        tx,
        idsActivos.map((productoId) => ({ productoId, cantidad: new Prisma.Decimal(1) })),
        { contactoId: acceso.conv.contactoId }
      );
      return {
        reservadas: await reservasActivasPorProducto(tx, idsActivos),
        precios: new Map(calculados.map((c) => [String(c.producto.id), c.total]))
      };
    });
    const apartadas = ids.length
      ? await db.ventaPartida.groupBy({
          by: ["productoId"],
          where: { productoId: { in: ids }, venta: { apartado: { estado: "activo" } } },
          _sum: { cantidad: true }
        })
      : [];
    const porProducto = new Map(apartadas.map((a) => [String(a.productoId), Number(a._sum.cantidad ?? 0)]));

    // Servicios agendables (Reservas en línea) cuyo nombre coincide, solo si Citas está activo.
    const servicios =
      q && (await moduloHabilitado("citas"))
        ? await db.servicioReserva.findMany({
            where: { activo: true, nombre: { contains: q, mode: "insensitive" } },
            orderBy: { nombre: "asc" },
            take: limite
          })
        : [];

    return NextResponse.json({
      productos: productos.map((p) => ({
        id: Number(p.id),
        nombre: p.nombre,
        sku: p.sku,
        categoria: p.categoria,
        descripcion: p.descripcion,
        precio: Number(precios.get(String(p.id)) ?? p.precio),
        moneda: p.moneda,
        unidad: p.unidad,
        existencia: Number(p.stock.minus(reservadas.get(String(p.id)) ?? 0)),
        apartada: porProducto.get(String(p.id)) ?? 0,
        disponible: !p.agotadoManual && p.stock.minus(reservadas.get(String(p.id)) ?? 0).gt(0)
      })),
      servicios: servicios.map((s) => ({
        id: Number(s.id),
        nombre: s.nombre,
        descripcion: s.descripcion,
        precio: Number(s.precio),
        duracionMin: s.duracionMin
      }))
    });
  });
}

export const GET = conErrores(manejarGET);
