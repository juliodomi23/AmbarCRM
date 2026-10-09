export type DecimalSerializado = string | number;

function enteroEscalado(valor: DecimalSerializado, decimales: number) {
  const coincidencia = String(valor).trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!coincidencia || (coincidencia[3]?.length ?? 0) > decimales) return null;
  const signo = coincidencia[1] === "-" ? -1n : 1n;
  const fraccion = (coincidencia[3] ?? "").padEnd(decimales, "0");
  return signo * BigInt(`${coincidencia[2]}${fraccion}`);
}

export function milesimas(valor: DecimalSerializado) {
  return enteroEscalado(valor, 3);
}

export function centavos(valor: DecimalSerializado) {
  return enteroEscalado(valor, 2);
}

export function compararCantidades(a: DecimalSerializado, b: DecimalSerializado) {
  const izquierda = milesimas(a);
  const derecha = milesimas(b);
  if (izquierda === null || derecha === null) return 0;
  return izquierda < derecha ? -1 : izquierda > derecha ? 1 : 0;
}

export function formatearCantidad(valor: DecimalSerializado, unidad?: string) {
  const valorMilesimas = milesimas(valor);
  if (valorMilesimas === null) return String(valor);
  return formatearMilesimas(valorMilesimas, unidad);
}

export function formatearMilesimas(valorMilesimas: bigint, unidad?: string) {
  const signo = valorMilesimas < 0 ? "-" : "";
  const absoluto = valorMilesimas < 0 ? -valorMilesimas : valorMilesimas;
  const enteros = absoluto / 1000n;
  const fraccion = String(absoluto % 1000n).padStart(3, "0").replace(/0+$/, "");
  const numero = `${signo}${enteros}${fraccion ? `.${fraccion}` : ""}`;
  return unidad ? `${numero} ${unidad}` : numero;
}

/** Precio de dos decimales × cantidad de tres decimales, redondeado a centavos. */
export function totalPartidaCentavos(
  precio: DecimalSerializado,
  cantidad: DecimalSerializado,
) {
  const precioCentavos = centavos(precio);
  const cantidadMilesimas = milesimas(cantidad);
  if (precioCentavos === null || cantidadMilesimas === null) return 0n;
  const producto = precioCentavos * cantidadMilesimas;
  return (producto + 500n) / 1000n;
}

export function numeroMoneda(valorCentavos: bigint) {
  return Number(valorCentavos) / 100;
}
