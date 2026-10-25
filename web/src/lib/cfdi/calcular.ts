import type { CalculoFactura, ConceptoCalculado, ConceptoNormalizado } from "./tipos";

export const TASA_IVA = 0.16;
export const TOLERANCIA_TOTAL = 0.01;

/** Redondeo comercial a 2 decimales, sin sesgo hacia arriba en negativos. */
export function redondear2(valor: number) {
  if (!Number.isFinite(valor)) return 0;
  const signo = valor < 0 ? -1 : 1;
  return (signo * Math.round((Math.abs(valor) + Number.EPSILON) * 100)) / 100;
}

export function calcularConcepto(concepto: ConceptoNormalizado): ConceptoCalculado {
  const importe = redondear2(concepto.cantidad * concepto.valorUnitario);
  const iva = redondear2(importe * concepto.ivaTasa);
  const retenciones = redondear2(importe * concepto.retencionTasa);
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
  const subtotal = redondear2(calculados.reduce((suma, concepto) => suma + concepto.importe, 0));
  const impuestos = redondear2(calculados.reduce((suma, concepto) => suma + concepto.iva, 0));
  const retenciones = redondear2(calculados.reduce((suma, concepto) => suma + concepto.retenciones, 0));
  const total = redondear2(subtotal + impuestos - retenciones);
  return { conceptos: calculados, subtotal, impuestos, retenciones, total };
}

/**
 * Convierte el total de una venta/pago (importe con IVA incluido) en conceptos
 * con IVA 16% exacto. Si el redondeo por concepto desv��a el total un centavo,
 * separa un concepto de ajuste; la tasa nunca cambia.
 */
export function conceptosDesdeTotal(total: number, descripcion: string): ConceptoNormalizado[] {
  const bruto = redondear2(total);
  if (bruto <= 0) return [];
  const subtotal = redondear2(bruto / (1 + TASA_IVA));
  const base: ConceptoNormalizado = {
    descripcion,
    cantidad: 1,
    valorUnitario: subtotal,
    ivaTasa: TASA_IVA,
    retencionTasa: 0,
  };
  if (calcularFactura([base]).total === bruto) return [base];

  const centavos = Math.round(subtotal * 100);
  for (let ajusteCentavos = 1; ajusteCentavos < centavos && ajusteCentavos <= 100_000; ajusteCentavos++) {
    const ajuste = ajusteCentavos / 100;
    const principal = redondear2(subtotal - ajuste);
    if (principal <= 0) break;
    const conceptos: ConceptoNormalizado[] = [
      { ...base, valorUnitario: principal },
      { ...base, descripcion: `${descripcion} (ajuste por redondeo)`, valorUnitario: ajuste },
    ];
    if (calcularFactura(conceptos).total === bruto) return conceptos;
  }

  throw new Error(`No se pudo desglosar el total ${bruto.toFixed(2)} con IVA 16% exacto`);
}

export function totalCoincide(totalCalculado: number, totalOrigen: number) {
  const diferencia = redondear2(Math.abs(redondear2(totalCalculado) - redondear2(totalOrigen)));
  return diferencia <= TOLERANCIA_TOTAL;
}
