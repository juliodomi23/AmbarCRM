import { Prisma } from "@prisma/client";

const MAXIMO = new Prisma.Decimal("999999999.999");

/** Cantidad positiva con hasta tres decimales, compatible con NUMERIC(12,3). */
export function cantidad(valor: unknown, minimo = new Prisma.Decimal(0)) {
  const texto = String(valor ?? "").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(texto)) return null;
  const valorDecimal = new Prisma.Decimal(texto);
  if (valorDecimal.gt(MAXIMO) || valorDecimal.lt(minimo)) return null;
  return valorDecimal;
}

/** Las piezas no aceptan fracciones; los productos por peso aceptan milésimas. */
export function cantidadValidaParaProducto(
  valor: Prisma.Decimal,
  vendePorPeso: boolean,
) {
  return vendePorPeso || valor.isInteger();
}

export function booleano(valor: unknown, predeterminado = false) {
  if (valor === undefined) return predeterminado;
  return valor === true || valor === "true" || valor === 1 || valor === "1";
}
