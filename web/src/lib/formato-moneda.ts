export function formatoMoneda(valor: number, moneda = "MXN", decimales = 0) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda, minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(valor);
}
