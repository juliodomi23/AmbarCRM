export const AREAS_AUDITORIA = [
  { clave: "contabilidad", nombre: "Contabilidad", descripcion: "Cierre, conciliaciones y obligaciones fiscales." },
  { clave: "administracion", nombre: "Administración", descripcion: "Gestión interna, personal y procesos administrativos." },
  { clave: "marketing", nombre: "Marketing", descripcion: "Contenido, campañas y calendario editorial." },
  { clave: "adquisicion", nombre: "Adquisición", descripcion: "Compras, proveedores y abastecimiento." },
] as const;

export type AreaAuditoria = (typeof AREAS_AUDITORIA)[number]["clave"];

export const COLORES_AUDITORIA = {
  rojo: {
    etiqueta: "Rojo",
    titulo: "No realizado / Incumplió",
    descripcion: "No se realizó la tarea o no se cumplió con lo acordado.",
    valor: 0,
    tono: "destructive",
    punto: "bg-destructive",
  },
  amarillo: {
    etiqueta: "Amarillo",
    titulo: "Realizado con observaciones",
    descripcion: "Se realizó, pero con deficiencias u observaciones.",
    valor: 1,
    tono: "warning",
    punto: "bg-warning",
  },
  verde: {
    etiqueta: "Verde",
    titulo: "Cumplimiento óptimo",
    descripcion: "Se realizó en tiempo y forma, sin observaciones.",
    valor: 2,
    tono: "success",
    punto: "bg-success",
  },
  gris_na: {
    etiqueta: "Gris / N-A",
    titulo: "No aplica",
    descripcion: "No corresponde al colaborador por descanso o por ser una tarea ajena a su área.",
    valor: null,
    tono: "neutral",
    punto: "bg-muted-foreground/40",
  },
} as const;

export type ColorAuditoria = keyof typeof COLORES_AUDITORIA;
export const CLAVES_COLOR = Object.keys(COLORES_AUDITORIA) as ColorAuditoria[];

export function esAreaAuditoria(valor: unknown): valor is AreaAuditoria {
  return AREAS_AUDITORIA.some((area) => area.clave === valor);
}

export function esColorAuditoria(valor: unknown): valor is ColorAuditoria {
  return CLAVES_COLOR.includes(valor as ColorAuditoria);
}

export function nombreArea(area: string) {
  return AREAS_AUDITORIA.find((item) => item.clave === area)?.nombre ?? area;
}

export function definicionColor(color: string) {
  return COLORES_AUDITORIA[color as ColorAuditoria] ?? null;
}

export function puedeGestionarAuditoria(puesto: string | undefined, rol: string | undefined) {
  if (rol === "admin") return true;
  return ["Administrador", "Director general", "Gerente general"].includes(String(puesto ?? "").trim());
}

export function normalizarPeriodo(valor: unknown): Date | null {
  const texto = String(valor ?? "").trim();
  const coincidencia = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(texto);
  if (!coincidencia) return null;
  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  if (anio < 2000 || anio > 2100 || mes < 1 || mes > 12) return null;
  return new Date(Date.UTC(anio, mes - 1, 1, 12));
}

export function rangoMesAuditoria(periodo: unknown) {
  const inicio = normalizarPeriodo(periodo);
  if (!inicio) return null;
  const fin = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 1, 12));
  return { inicio, fin };
}

export function mesDesplazado(periodo: Date, meses: number) {
  return new Date(Date.UTC(periodo.getUTCFullYear(), periodo.getUTCMonth() + meses, 1, 12));
}

export function mesISO(periodo: Date) {
  return `${periodo.getUTCFullYear()}-${String(periodo.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodoLargo(periodo: Date) {
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(periodo);
}

export function resumenSemaforo(colores: string[]) {
  const conteo = { verde: 0, amarillo: 0, rojo: 0, gris_na: 0 };
  for (const color of colores) {
    if (color in conteo) conteo[color as ColorAuditoria] += 1;
  }
  return conteo;
}
