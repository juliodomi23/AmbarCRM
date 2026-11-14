export type TipoFinanza = "ingreso" | "costo" | "gasto";

export const ETIQUETA_TIPO_FINANZA: Record<TipoFinanza, string> = {
  ingreso: "Ingresos",
  costo: "Costos",
  gasto: "Gastos",
};

export const CONCEPTOS_FINANZAS: Record<TipoFinanza, readonly string[]> = {
  ingreso: [
    "Servicios de contabilidad",
    "Folios fiscales",
    "CRUC BALAM",
    "REPSE",
    "FONACOT",
    "Servicios de auditoría",
    "Peritajes contables",
    "Otros servicios relacionados a la contaduría",
  ],
  costo: ["Nómina", "Folios fiscales", "Eventos"],
  gasto: [
    "Renta",
    "Limpieza",
    "Internet y teléfono",
    "Papelería y útiles",
    "Publicidad",
    "Otros gastos",
  ],
};

export function esTipoFinanza(valor: string): valor is TipoFinanza {
  return valor === "ingreso" || valor === "costo" || valor === "gasto";
}

export function conceptosDeTipo(tipo: TipoFinanza): readonly string[] {
  return CONCEPTOS_FINANZAS[tipo];
}

export function valorConcepto(tipo: TipoFinanza, concepto: string): string {
  return `${tipo}|${concepto}`;
}

export function parsearValorConcepto(valor: string): { tipo: TipoFinanza; concepto: string } | null {
  const separador = valor.indexOf("|");
  if (separador < 0) return null;
  const tipo = valor.slice(0, separador);
  const concepto = valor.slice(separador + 1);
  if (!esTipoFinanza(tipo) || !concepto) return null;
  return { tipo, concepto };
}
