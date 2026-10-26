import { Prisma } from "@prisma/client";

export const IVA_DEFAULT = new Prisma.Decimal("0.16");
export const CERO_IVA = new Prisma.Decimal(0);
export const TASA_IVA_ENVIO = new Prisma.Decimal("0.16");

export function redondearImporte(valor: Prisma.Decimal) {
  return valor.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function desglosarImporte(
  total: Prisma.Decimal,
  tasaEntrada: Prisma.Decimal | null,
  precioIncluyeIva = true,
  exento = false,
) {
  const importe = redondearImporte(total);
  if (exento) return { baseImporte: importe, ivaImporte: CERO_IVA };
  const tasa = tasaEntrada ?? CERO_IVA;
  if (tasa.isZero()) return { baseImporte: importe, ivaImporte: CERO_IVA };
  if (!precioIncluyeIva) {
    const ivaImporte = redondearImporte(importe.mul(tasa));
    return { baseImporte: importe, ivaImporte };
  }
  const baseImporte = redondearImporte(importe.div(new Prisma.Decimal(1).plus(tasa)));
  return { baseImporte, ivaImporte: importe.minus(baseImporte) };
}

export function desgloseVenta(
  partidas: readonly { total: Prisma.Decimal; descuento?: Prisma.Decimal; tasa: Prisma.Decimal; exento: boolean; ivaIncluido: boolean }[],
  descuentoGeneral: Prisma.Decimal,
  costoEnvio: Prisma.Decimal = CERO_IVA,
) {
  const iniciales = partidas.map((partida) => {
    const neto = partida.total.minus(partida.descuento ?? CERO_IVA);
    return {
      ...desglosarImporte(neto, partida.tasa, partida.ivaIncluido, partida.exento),
      ivaTasa: partida.tasa,
      ivaExento: partida.exento,
    };
  });
  const conDescuento = distribuirDescuentoIva(iniciales, descuentoGeneral);
  const envio = desglosarImporte(costoEnvio, TASA_IVA_ENVIO, true);
  const ivaTotal = conDescuento.reduce((suma, partida) => suma.plus(partida.ivaImporte), CERO_IVA).plus(envio.ivaImporte);
  return { partidas: conDescuento, ivaEnvio: envio.ivaImporte, ivaTotal };
}

export function distribuirDescuentoIva<T extends { baseImporte: Prisma.Decimal; ivaImporte: Prisma.Decimal }>(
  partidas: readonly T[],
  descuento: Prisma.Decimal,
) {
  const total = partidas.reduce((suma, partida) => suma.plus(partida.baseImporte).plus(partida.ivaImporte), CERO_IVA);
  if (total.isZero() || descuento.isZero()) return partidas;
  let descuentoAsignado = CERO_IVA;
  return partidas.map((partida, indice) => {
    const parteDescuento = indice === partidas.length - 1
      ? descuento.minus(descuentoAsignado)
      : redondearImporte(descuento.mul(partida.baseImporte.plus(partida.ivaImporte)).div(total));
    descuentoAsignado = descuentoAsignado.plus(parteDescuento);
    const proporcionBase = partida.baseImporte.div(partida.baseImporte.plus(partida.ivaImporte));
    const baseDescuento = redondearImporte(parteDescuento.mul(proporcionBase));
    return {
      ...partida,
      baseImporte: partida.baseImporte.minus(baseDescuento),
      ivaImporte: partida.ivaImporte.minus(parteDescuento.minus(baseDescuento)),
    };
  });
}
