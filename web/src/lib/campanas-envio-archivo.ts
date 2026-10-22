import { telefonoMx } from "@/lib/reservas/telefono";

export type MapeoColumnas = { telefono: number; nombre?: number; empresa?: number; giro?: number; zona?: number };

const sinonimos = {
  telefono: ["telefono", "celular", "whatsapp", "phone", "tel", "movil"],
  nombre: ["nombre", "name", "contacto", "contacto publicado"],
  empresa: ["empresa", "company", "negocio", "razon social"],
  giro: ["giro", "sector", "segmento", "area", "rubro"],
  zona: ["ciudad", "municipio", "zona", "localidad", "region", "plaza"],
} as const;

export function limpiarTexto(valor: unknown) {
  return String(valor ?? "").trim().replace(/\s+/g, " ");
}

export function claveTexto(valor: unknown) {
  return limpiarTexto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX");
}

export function mapearColumnas(headers: string[]): MapeoColumnas {
  const normalizados = headers.map(claveTexto);
  const indice = (campo: keyof typeof sinonimos) => normalizados.findIndex((header) => (sinonimos[campo] as readonly string[]).includes(header));
  const telefono = indice("telefono"), nombre = indice("nombre"), empresa = indice("empresa"), giro = indice("giro"), zona = indice("zona");
  return { telefono, ...(nombre >= 0 ? { nombre } : {}), ...(empresa >= 0 ? { empresa } : {}), ...(giro >= 0 ? { giro } : {}), ...(zona >= 0 ? { zona } : {}) };
}

export function detectarFilaEncabezados(filas: string[][]) {
  let revisadas = 0;
  for (const [indice, fila] of filas.entries()) {
    if (!fila.some((celda) => limpiarTexto(celda))) continue;
    if (++revisadas > 15) break;
    if (fila.filter((celda) => limpiarTexto(celda)).length >= 3 && mapearColumnas(fila).telefono >= 0) return indice + 1;
  }
  return null;
}

export function prepararArchivoCampana(filas: string[][], filaEncabezados?: number) {
  const detectada = detectarFilaEncabezados(filas);
  const elegida = filaEncabezados ?? detectada;
  if (!elegida || !Number.isInteger(elegida) || elegida < 1 || elegida > filas.length || !filas[elegida - 1]?.some((celda) => limpiarTexto(celda)))
    throw new Error("Indica la fila que contiene los encabezados");
  const headers = filas[elegida - 1].map(limpiarTexto);
  return { filaEncabezados: elegida, detectada, headers, mapeo: mapearColumnas(headers) };
}

export function normalizarTelefonoCampana(valor: unknown): string | null {
  const texto = limpiarTexto(valor);
  const completo = telefonoMx(texto);
  if (completo) return `52${completo}`;
  const partes = texto.split(/\s+y\s+|[/,;]/i);
  for (const parte of partes) {
    const sinExtension = parte.replace(/\b(?:ext(?:ension|ensión)?\.?|x\.?)\s*[:#-]?\s*\d+.*$/i, "").trim();
    const diezDigitos = telefonoMx(sinExtension);
    if (diezDigitos) return `52${diezDigitos}`;
  }
  return null;
}
