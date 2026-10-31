export type ConceptoTallerImporte = { cantidad: number; precioUnitario: number };

const transiciones: Record<string, readonly string[]> = {
  recibido: ["diagnostico", "cancelado"],
  diagnostico: ["esperando_aprobacion", "en_reparacion", "cancelado"],
  esperando_aprobacion: ["diagnostico", "cancelado"],
  en_reparacion: ["listo", "cancelado"],
  listo: ["entregado", "en_reparacion"],
  entregado: [],
  cancelado: [],
};

export function transicionTallerValida(actual: string, siguiente: string) {
  return actual === siguiente || Boolean(transiciones[actual]?.includes(siguiente));
}

export function calcularTotalTaller(conceptos: readonly ConceptoTallerImporte[]) {
  return conceptos.reduce((total, concepto) => total + Math.round(concepto.cantidad * concepto.precioUnitario * 100) / 100, 0);
}

export function puedeEntregarConSaldo(rol: string | undefined, confirmacionExplicita: boolean, saldo: number) {
  return saldo <= 0 || (rol === "admin" && confirmacionExplicita);
}
