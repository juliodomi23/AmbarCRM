import { Prisma } from "@prisma/client";
import { fechaLocal } from "@/lib/reservas/horarios";
import { configReservas } from "@/lib/reservas/servidor";
import { calcularLineaPura, type PromocionPura } from "@/lib/precios-puro";
import { ErrorRetail } from "@/lib/retail-db";

const ZONA_PRECIOS = "America/Mexico_City";

export type EntradaPrecio = { productoId: bigint; cantidad: Prisma.Decimal };
export type PrecioCalculado = {
  producto: Prisma.ProductoGetPayload<Record<string, never>>;
  cantidad: Prisma.Decimal;
  precioUnitario: Prisma.Decimal;
  bruto: Prisma.Decimal;
  descuentoPromocion: Prisma.Decimal;
  promocionDescripcion: string | null;
  total: Prisma.Decimal;
  fuentePrecio: "catalogo" | "volumen" | "lista";
};

export async function zonaEmpresa(tx: Prisma.TransactionClient) {
  const reservas = await tx.moduloOrg.findFirst({ where: { clave: "reservas_en_linea" }, select: { config: true } });
  return reservas ? configReservas(reservas.config).zona : ZONA_PRECIOS;
}

/** Único motor de precios: volumen, lista de cliente/pública y después promoción local vigente. */
export async function calcularPrecios(
  tx: Prisma.TransactionClient,
  entradas: readonly EntradaPrecio[],
  opciones: { contactoId?: bigint | null; publico?: boolean; ahora?: Date } = {},
): Promise<PrecioCalculado[]> {
  const ids = [...new Set(entradas.map((entrada) => String(entrada.productoId)))].map(BigInt);
  const productos = await tx.producto.findMany({ where: { id: { in: ids }, activo: true } });
  if (productos.length !== ids.length) throw new ErrorRetail("Uno de los productos no existe o está inactivo", 404);
  const porId = new Map(productos.map((producto) => [String(producto.id), producto]));

  let listaId: bigint | null = null;
  if (opciones.contactoId) {
    listaId = (await tx.contacto.findUnique({ where: { id: opciones.contactoId }, select: { listaPrecioId: true } }))?.listaPrecioId ?? null;
  }
  if (listaId === null) {
    listaId = (await tx.listaPrecio.findFirst({ where: { tipo: "publico", activa: true }, orderBy: { id: "asc" }, select: { id: true } }))?.id ?? null;
  }
  const [escalas, preciosLista, promociones, zona] = await Promise.all([
    tx.precioVolumen.findMany({ where: { productoId: { in: ids } }, orderBy: [{ productoId: "asc" }, { desde: "desc" }] }),
    listaId ? tx.listaPrecioProducto.findMany({ where: { listaId, productoId: { in: ids }, lista: { activa: true } } }) : [],
    tx.promocion.findMany({ where: { activa: true, OR: [{ productoId: { in: ids } }, { categoria: { in: productos.flatMap((p) => p.categoria ? [p.categoria] : []) } }] }, orderBy: { id: "asc" } }),
    zonaEmpresa(tx),
  ]);
  const precioLista = new Map(preciosLista.map((item) => [String(item.productoId), item.precio]));
  const hoy = fechaLocal(opciones.ahora ?? new Date(), zona);

  const promocionesPuras: PromocionPura[] = promociones.map((promo) => ({
    id: promo.id,
    productoId: promo.productoId,
    categoria: promo.categoria,
    tipo: promo.tipo,
    nombre: promo.nombre,
    valor: promo.valor,
    cantidadCompra: promo.cantidadCompra,
    cantidadPaga: promo.cantidadPaga,
    inicia: promo.inicia.toISOString().slice(0, 10),
    termina: promo.termina.toISOString().slice(0, 10),
  }));

  return entradas.map((entrada) => {
    const producto = porId.get(String(entrada.productoId))!;
    const linea = calcularLineaPura({
      productoId: producto.id,
      categoria: producto.categoria,
      precioCatalogo: producto.precio,
      precioLista: precioLista.get(String(producto.id)) ?? null,
      escalas: escalas.filter((item) => item.productoId === producto.id),
      cantidad: entrada.cantidad,
      promociones: promocionesPuras,
      hoy,
    });
    return { producto, cantidad: entrada.cantidad, ...linea };
  });
}
