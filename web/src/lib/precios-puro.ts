import { Prisma } from "@prisma/client";

// Regla de precios sin base de datos: la usan el servidor (precios-db.ts) y la caja sin internet.
// Cualquier cambio aquí cambia las dos; test-paridad-precios.ts y test-precios-promociones.ts lo cuidan.

export type PromocionPura = {
  id: string | bigint;
  productoId: string | bigint | null;
  categoria: string | null;
  tipo: string;
  nombre: string;
  valor: Prisma.Decimal | null;
  cantidadCompra: number | null;
  cantidadPaga: number | null;
  /** Fechas locales AAAA-MM-DD, ambas incluidas. */
  inicia: string;
  termina: string;
};

export type EscalaPura = { desde: Prisma.Decimal; precio: Prisma.Decimal };

export type EntradaLineaPura = {
  productoId: string | bigint;
  categoria: string | null;
  precioCatalogo: Prisma.Decimal;
  precioLista: Prisma.Decimal | null;
  /** Solo las escalas del producto, de mayor a menor `desde`. */
  escalas: readonly EscalaPura[];
  cantidad: Prisma.Decimal;
  promociones: readonly PromocionPura[];
  /** Fecha local AAAA-MM-DD de la venta. */
  hoy: string;
};

export type LineaPura = {
  precioUnitario: Prisma.Decimal;
  bruto: Prisma.Decimal;
  descuentoPromocion: Prisma.Decimal;
  promocionDescripcion: string | null;
  total: Prisma.Decimal;
  fuentePrecio: "catalogo" | "volumen" | "lista";
};

export function descuentoDePromocion(
  promocion: Pick<PromocionPura, "tipo" | "valor" | "cantidadCompra" | "cantidadPaga">,
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

const idMenor = (a: string | bigint, b: string | bigint) => BigInt(a) < BigInt(b);

export function calcularLineaPura(entrada: EntradaLineaPura): LineaPura {
  const escala = entrada.escalas.find((item) => entrada.cantidad.gte(item.desde));
  const deLista = entrada.precioLista ?? undefined;
  const precioUnitario = escala?.precio ?? deLista ?? entrada.precioCatalogo;
  const fuentePrecio = escala ? "volumen" as const : deLista ? "lista" as const : "catalogo" as const;
  const bruto = precioUnitario.mul(entrada.cantidad).toDecimalPlaces(2);
  const candidatas = entrada.promociones
    .filter((promo) => (
      (promo.productoId !== null && String(promo.productoId) === String(entrada.productoId))
      || (promo.productoId === null && promo.categoria === entrada.categoria)
    ))
    .filter((promo) => promo.inicia <= entrada.hoy && promo.termina >= entrada.hoy)
    .map((promo) => ({ promo, descuento: descuentoDePromocion(promo, precioUnitario, entrada.cantidad, bruto) }))
    .sort((a, b) => b.descuento.comparedTo(a.descuento) || (idMenor(a.promo.id, b.promo.id) ? -1 : 1));
  const aplicada = candidatas[0]?.descuento.gt(0) ? candidatas[0] : null;
  const descuentoPromocion = aplicada?.descuento ?? new Prisma.Decimal(0);
  return {
    precioUnitario,
    bruto,
    descuentoPromocion,
    promocionDescripcion: aplicada?.promo.nombre ?? null,
    total: bruto.minus(descuentoPromocion),
    fuentePrecio,
  };
}
