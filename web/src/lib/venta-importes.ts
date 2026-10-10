import { Prisma } from "@prisma/client";

type PartidaImporte = {
  id: bigint;
  cantidad: Prisma.Decimal;
  total: Prisma.Decimal;
};

const CERO = new Prisma.Decimal(0);

/** Distribuye el total realmente cobrado entre partidas y ajusta el último centavo. */
export function ingresosNetosPorPartida(
  partidas: readonly PartidaImporte[],
  totalVenta: Prisma.Decimal,
) {
  const ordenadas = [...partidas].sort((a, b) => (a.id < b.id ? -1 : 1));
  const base = ordenadas.reduce((suma, partida) => suma.plus(partida.total), CERO);
  if (base.lte(0)) return new Map<string, Prisma.Decimal>();
  const importes = new Map<string, Prisma.Decimal>();
  let asignado = CERO;
  for (const [indice, partida] of ordenadas.entries()) {
    const importe = indice === ordenadas.length - 1
      ? totalVenta.minus(asignado)
      : partida.total.mul(totalVenta).div(base).toDecimalPlaces(2);
    importes.set(String(partida.id), importe);
    asignado = asignado.plus(importe);
  }
  return importes;
}

/** Importe acumulado al devolver una cantidad; evita perder centavos entre devoluciones parciales. */
export function importeAcumuladoPorCantidad(
  importePartida: Prisma.Decimal,
  cantidadAcumulada: Prisma.Decimal,
  cantidadVendida: Prisma.Decimal,
) {
  return importePartida.mul(cantidadAcumulada).div(cantidadVendida).toDecimalPlaces(2);
}

export function metricasNetasPartida(
  ingresoVendido: Prisma.Decimal,
  cantidadVendida: Prisma.Decimal,
  costoUnitario: Prisma.Decimal | null,
  devoluciones: readonly { cantidad: Prisma.Decimal; monto: Prisma.Decimal }[],
) {
  const ingresoDevuelto = devoluciones.reduce((suma, devolucion) => suma.plus(devolucion.monto), CERO);
  const cantidadDevuelta = devoluciones.reduce((suma, devolucion) => suma.plus(devolucion.cantidad), CERO);
  const ingresoNeto = ingresoVendido.minus(ingresoDevuelto);
  if (costoUnitario === null) return { ingresoNeto, costoNeto: null, utilidad: null, cantidadDevuelta };
  const costoNeto = costoUnitario.mul(cantidadVendida.minus(cantidadDevuelta)).toDecimalPlaces(2);
  return { ingresoNeto, costoNeto, utilidad: ingresoNeto.minus(costoNeto), cantidadDevuelta };
}
