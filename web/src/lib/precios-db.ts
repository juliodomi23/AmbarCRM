import { Prisma } from "@prisma/client";
import { fechaLocal } from "@/lib/reservas/horarios";
import { configReservas } from "@/lib/reservas/servidor";
import { importePartida } from "@/lib/retail";
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

async function zonaEmpresa(tx: Prisma.TransactionClient) {
  const reservas = await tx.moduloOrg.findFirst({ where: { clave: "reservas_en_linea" }, select: { config: true } });
  return reservas ? configReservas(reservas.config).zona : ZONA_PRECIOS;
}

function descuentoDePromocion(
  promocion: {
    tipo: string;
    nombre: string;
    valor: Prisma.Decimal | null;
    cantidadCompra: number | null;
    cantidadPaga: number | null;
  },
  precio: Prisma.Decimal,
  cantidad: Prisma.Decimal,
  bruto: Prisma.Decimal,
) {
  let descuento = new Prisma.Decimal(0);
  if (promocion.tipo === "porcentaje" && promocion.valor) {
    descuento = bruto.mul(Prisma.Decimal.min(promocion.valor, 100)).div(100).toDecimalPlaces(2);
  } else if (promocion.tipo === "monto" && promocion.valor) {
    descuento = promocion.valor.mul(cantidad).toDecimalPlaces(2);
  } else if (promocion.tipo === "precio_especial" && promocion.valor && promocion.valor.lt(precio)) {
    descuento = precio.minus(promocion.valor).mul(cantidad).toDecimalPlaces(2);
  } else if (
    promocion.tipo === "nxm" && promocion.cantidadCompra && promocion.cantidadPaga && cantidad.isInteger()
  ) {
    const grupos = Math.floor(cantidad.toNumber() / promocion.cantidadCompra);
    descuento = precio.mul(grupos * (promocion.cantidadCompra - promocion.cantidadPaga)).toDecimalPlaces(2);
  }
  return Prisma.Decimal.min(Prisma.Decimal.max(descuento, 0), bruto);
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

  return entradas.map((entrada) => {
    const producto = porId.get(String(entrada.productoId))!;
    const escala = escalas.find((item) => item.productoId === producto.id && entrada.cantidad.gte(item.desde));
    const deLista = precioLista.get(String(producto.id));
    const precioUnitario = escala?.precio ?? deLista ?? producto.precio;
    const fuentePrecio = escala ? "volumen" as const : deLista ? "lista" as const : "catalogo" as const;
    const bruto = importePartida(precioUnitario, entrada.cantidad);
    const candidatas = promociones
      .filter((promo) => (promo.productoId === producto.id || (promo.productoId === null && promo.categoria === producto.categoria)))
      .filter((promo) => promo.inicia.toISOString().slice(0, 10) <= hoy && promo.termina.toISOString().slice(0, 10) >= hoy)
      .map((promo) => ({ promo, descuento: descuentoDePromocion(promo, precioUnitario, entrada.cantidad, bruto) }))
      .sort((a, b) => b.descuento.comparedTo(a.descuento) || (a.promo.id < b.promo.id ? -1 : 1));
    const aplicada = candidatas[0]?.descuento.gt(0) ? candidatas[0] : null;
    const descuentoPromocion = aplicada?.descuento ?? new Prisma.Decimal(0);
    return {
      producto,
      cantidad: entrada.cantidad,
      precioUnitario,
      bruto,
      descuentoPromocion,
      promocionDescripcion: aplicada?.promo.nombre ?? null,
      total: bruto.minus(descuentoPromocion),
      fuentePrecio,
    };
  });
}
