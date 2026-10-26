import type { CalculoFactura, ConceptoCalculado, ConceptoNormalizado } from "./tipos";
import { Prisma } from "@prisma/client";

export const TASA_IVA = 0.16;
export const TOLERANCIA_TOTAL = 0.01;

/** Redondeo comercial a 2 decimales, sin sesgo hacia arriba en negativos. */
export function redondear2(valor: number) {
  if (!Number.isFinite(valor)) return 0;
  return new Prisma.Decimal(String(valor)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

export function calcularConcepto(concepto: ConceptoNormalizado): ConceptoCalculado {
  const cantidad = new Prisma.Decimal(String(concepto.cantidad));
  const unitario = new Prisma.Decimal(String(concepto.valorUnitario));
  const importeDecimal = cantidad.mul(unitario).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const ivaDecimal = concepto.ivaExento ? new Prisma.Decimal(0) : importeDecimal.mul(String(concepto.ivaTasa)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const retencionesDecimal = importeDecimal.mul(String(concepto.retencionTasa)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const importe = importeDecimal.toNumber();
  const iva = ivaDecimal.toNumber();
  const retenciones = retencionesDecimal.toNumber();
  return {
    ...concepto,
    importe,
    iva,
    retenciones,
  };
}

/** El servidor siempre recalcula: nunca se confía en los importes del cliente. */
export function calcularFactura(conceptos: ConceptoNormalizado[]): CalculoFactura {
  const calculados = conceptos.map(calcularConcepto);
  const subtotalDecimal = calculados.reduce((suma, concepto) => suma.plus(concepto.importe), new Prisma.Decimal(0));
  const impuestosDecimal = calculados.reduce((suma, concepto) => suma.plus(concepto.iva), new Prisma.Decimal(0));
  const retencionesDecimal = calculados.reduce((suma, concepto) => suma.plus(concepto.retenciones), new Prisma.Decimal(0));
  const subtotal = subtotalDecimal.toDecimalPlaces(2).toNumber();
  const impuestos = impuestosDecimal.toDecimalPlaces(2).toNumber();
  const retenciones = retencionesDecimal.toDecimalPlaces(2).toNumber();
  const total = subtotalDecimal.plus(impuestosDecimal).minus(retencionesDecimal).toDecimalPlaces(2).toNumber();
  return { conceptos: calculados, subtotal, impuestos, retenciones, total };
}

/**
 * Convierte el total de una venta/pago (importe con IVA incluido) en conceptos
 * con IVA 16% exacto. Si el redondeo por concepto desv��a el total un centavo,
 * separa un concepto de ajuste; la tasa nunca cambia.
 */
export function conceptosDesdeTotal(total: number, descripcion: string): ConceptoNormalizado[] {
  const bruto = new Prisma.Decimal(String(total)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (bruto.lte(0)) return [];
  const subtotal = bruto.div(new Prisma.Decimal(1).plus(TASA_IVA)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const base: ConceptoNormalizado = {
    descripcion,
    cantidad: 1,
    valorUnitario: subtotal.toNumber(),
    ivaTasa: TASA_IVA,
    retencionTasa: 0,
  };
  if (new Prisma.Decimal(calcularFactura([base]).total).eq(bruto)) return [base];

  const centavos = subtotal.mul(100).toDecimalPlaces(0).toNumber();
  for (let ajusteCentavos = 1; ajusteCentavos < centavos && ajusteCentavos <= 100_000; ajusteCentavos++) {
    const ajuste = new Prisma.Decimal(ajusteCentavos).div(100);
    const principal = subtotal.minus(ajuste).toDecimalPlaces(2);
    if (principal.lte(0)) break;
    const conceptos: ConceptoNormalizado[] = [
      { ...base, valorUnitario: principal.toNumber() },
      { ...base, descripcion: `${descripcion} (ajuste por redondeo)`, valorUnitario: ajuste.toNumber() },
    ];
    if (new Prisma.Decimal(calcularFactura(conceptos).total).eq(bruto)) return conceptos;
  }

  throw new Error(`No se pudo desglosar el total ${bruto.toFixed(2)} con IVA 16% exacto`);
}

export function conceptosDesdeSnapshots(
  total: number,
  conceptosEntrada: readonly { descripcion: string; baseImporte: Prisma.Decimal | string; ivaTasa: Prisma.Decimal | string | null; ivaExento: boolean }[],
): ConceptoNormalizado[] {
  const conceptos = conceptosEntrada.map((concepto) => ({
    descripcion: concepto.descripcion,
    cantidad: 1,
    valorUnitario: new Prisma.Decimal(String(concepto.baseImporte)).toDecimalPlaces(2).toNumber(),
    ivaTasa: concepto.ivaTasa === null ? TASA_IVA : Number(String(concepto.ivaTasa)),
    ivaExento: concepto.ivaExento,
    retencionTasa: 0,
  }));
  const bruto = new Prisma.Decimal(String(total)).toDecimalPlaces(2);
  if (new Prisma.Decimal(calcularFactura(conceptos).total).eq(bruto)) return conceptos;

  for (let indice = 0; indice < conceptos.length; indice++) {
    const base = new Prisma.Decimal(String(conceptos[indice].valorUnitario));
    for (let centavos = 1; centavos <= 10_000; centavos++) {
      for (const signo of [1, -1]) {
        const ajustado = base.plus(new Prisma.Decimal(centavos * signo).div(100));
        if (ajustado.lt(0)) continue;
        const candidato = conceptos.map((concepto, indiceConcepto) => indice === indiceConcepto
          ? { ...concepto, valorUnitario: ajustado.toNumber() }
          : concepto);
        if (new Prisma.Decimal(calcularFactura(candidato).total).eq(bruto)) return candidato;
      }
    }
  }
  throw new Error(`Los snapshots fiscales no suman el total ${bruto.toFixed(2)} sin cambiar las tasas`);
}

export function totalCoincide(totalCalculado: number, totalOrigen: number) {
  const diferencia = new Prisma.Decimal(String(totalCalculado)).minus(String(totalOrigen)).abs().toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return diferencia.lte(String(TOLERANCIA_TOTAL));
}
