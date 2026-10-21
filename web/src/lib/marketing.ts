import { dinero } from "./dinero";

export const OBJETIVOS_MARKETING = {
  mensajes: "Recibir mensajes",
  clientes_potenciales: "Conseguir clientes potenciales",
  ventas: "Generar ventas",
  reconocimiento: "Dar a conocer mi negocio",
} as const;

export const CANALES_MARKETING = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  otro: "Otro canal",
  facebook_instagram: "Facebook e Instagram",
} as const;

export const ESTADOS_MARKETING = {
  borrador: "Borrador",
  en_revision: "En revisión",
  aprobada: "Aprobada internamente",
  archivada: "Archivada",
} as const;

export type TipoCampana = "marketing" | "meta_ads";
export type EstadoCampana = keyof typeof ESTADOS_MARKETING;
export type ObjetivoCampana = keyof typeof OBJETIVOS_MARKETING;
export type CanalCampana = keyof typeof CANALES_MARKETING;
export type AccionCampana = "enviar_revision" | "aprobar" | "devolver_borrador" | "archivar";

export type CamposCampana = {
  nombre: string;
  objetivo: ObjetivoCampana;
  canal: CanalCampana;
  audiencia: string;
  contenido: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  presupuesto: string | null;
};

export type CampanaMarketingDto = CamposCampana & {
  id: string;
  tipo: TipoCampana;
  estado: EstadoCampana;
  version: number;
  aprobadaPorId: string | null;
  aprobadaAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListaCampanasDto = {
  campanas: CampanaMarketingDto[];
  total: number;
  page: number;
  limite: number;
  resumen: Record<EstadoCampana, number>;
};

export class ErrorMarketing extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ErrorMarketing";
  }
}

const CAMPOS_EDITABLES = ["nombre", "objetivo", "canal", "audiencia", "contenido", "fechaInicio", "fechaFin", "presupuesto"];
const ACCIONES: AccionCampana[] = ["enviar_revision", "aprobar", "devolver_borrador", "archivar"];

export function objetoCampana(valor: unknown): Record<string, unknown> {
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) {
    throw new ErrorMarketing("Envía los datos de la campaña como un objeto.");
  }
  return valor as Record<string, unknown>;
}

function texto(valor: unknown, nombre: string, maximo: number, requerido = false) {
  if (valor === undefined && !requerido) return "";
  if (typeof valor !== "string") throw new ErrorMarketing(`${nombre} debe ser texto.`);
  const resultado = valor.trim();
  if (resultado.length > maximo) throw new ErrorMarketing(`${nombre}: usa como máximo ${maximo} caracteres.`);
  if (requerido && !resultado) throw new ErrorMarketing(`Completa ${nombre.toLowerCase()}.`);
  return resultado;
}

export function fechaCampana(valor: unknown, nombre: string): string | null {
  if (valor === undefined || valor === null || valor === "") return null;
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor < "1900-01-01" || valor > "9999-12-31") {
    throw new ErrorMarketing(`${nombre}: usa una fecha válida (AAAA-MM-DD).`);
  }
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  if (!Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
    throw new ErrorMarketing(`${nombre}: la fecha no existe.`);
  }
  return valor;
}

export function validarCamposCampana(tipo: TipoCampana, entrada: unknown): CamposCampana {
  const datos = objetoCampana(entrada);
  if (Object.keys(datos).some(clave => !CAMPOS_EDITABLES.includes(clave))) {
    throw new ErrorMarketing("La solicitud contiene campos que no se pueden editar.");
  }
  const nombre = texto(datos.nombre, "Nombre de la campaña", 120, true);
  const objetivo = datos.objetivo;
  if (typeof objetivo !== "string" || !Object.hasOwn(OBJETIVOS_MARKETING, objetivo)) {
    throw new ErrorMarketing("Elige un objetivo válido para la campaña.");
  }
  const canal = datos.canal;
  if (typeof canal !== "string" || !Object.hasOwn(CANALES_MARKETING, canal) ||
      (tipo === "meta_ads" ? canal !== "facebook_instagram" : canal === "facebook_instagram")) {
    throw new ErrorMarketing(tipo === "meta_ads" ? "Meta Ads usa Facebook e Instagram." : "Elige un canal válido para Marketing.");
  }
  const fechaInicio = fechaCampana(datos.fechaInicio, "Fecha de inicio");
  const fechaFin = fechaCampana(datos.fechaFin, "Fecha de fin");
  if (fechaInicio && fechaFin && fechaFin < fechaInicio) throw new ErrorMarketing("La fecha de fin debe ser igual o posterior al inicio.");
  let presupuesto: string | null = null;
  if (datos.presupuesto !== undefined && datos.presupuesto !== null && datos.presupuesto !== "") {
    if (typeof datos.presupuesto !== "string" && typeof datos.presupuesto !== "number") throw new ErrorMarketing("Escribe un presupuesto válido en MXN.");
    const monto = dinero(datos.presupuesto);
    if (monto === null) throw new ErrorMarketing("El presupuesto debe ser un monto positivo o cero, con máximo dos decimales.");
    presupuesto = monto.toFixed(2);
  }
  return {
    nombre, objetivo: objetivo as ObjetivoCampana, canal: canal as CanalCampana,
    audiencia: texto(datos.audiencia, "Público objetivo", 2000),
    contenido: texto(datos.contenido, "Contenido", 10000),
    fechaInicio, fechaFin, presupuesto,
  };
}

export function faltantesRevision(campana: CamposCampana & { tipo: TipoCampana }): string[] {
  const faltantes: string[] = [];
  if (!campana.nombre.trim()) faltantes.push("Nombre de la campaña");
  if (!campana.objetivo) faltantes.push("Objetivo");
  if (!campana.canal) faltantes.push("Canal");
  if (!campana.audiencia.trim()) faltantes.push("Público objetivo");
  if (!campana.contenido.trim()) faltantes.push("Contenido");
  if (!campana.fechaInicio) faltantes.push("Fecha de inicio");
  if (!campana.fechaFin) faltantes.push("Fecha de fin");
  if (campana.tipo === "meta_ads" && (dinero(campana.presupuesto) ?? 0) <= 0) faltantes.push("Presupuesto total mayor a $0 MXN");
  return faltantes;
}

export function validarCambioCampana(entrada: unknown) {
  const datos = objetoCampana(entrada);
  if (!Number.isSafeInteger(datos.version) || Number(datos.version) < 1 || Number(datos.version) >= 2_147_483_647) {
    throw new ErrorMarketing("Falta la versión de la campaña. Recarga e inténtalo de nuevo.");
  }
  const version = datos.version as number;
  if (Object.hasOwn(datos, "accion")) {
    if (Object.keys(datos).some(clave => clave !== "version" && clave !== "accion") || !ACCIONES.includes(datos.accion as AccionCampana)) {
      throw new ErrorMarketing("Elige una acción válida. Guarda los cambios antes de cambiar de estado.");
    }
    return { version, accion: datos.accion as AccionCampana, cambios: null };
  }
  const cambios = Object.fromEntries(Object.entries(datos).filter(([clave]) => clave !== "version"));
  if (!Object.keys(cambios).length || Object.keys(cambios).some(clave => !CAMPOS_EDITABLES.includes(clave))) {
    throw new ErrorMarketing("La solicitud no contiene cambios válidos para la campaña.");
  }
  return { version, accion: null, cambios };
}

export function estadoTrasAccion(estado: EstadoCampana, accion: AccionCampana, esAdmin: boolean): EstadoCampana {
  if (accion === "aprobar" && !esAdmin) throw new ErrorMarketing("Solo un administrador puede aprobar la campaña.", 403);
  if (accion === "devolver_borrador" && estado === "aprobada" && !esAdmin) {
    throw new ErrorMarketing("Solo un administrador puede reabrir una campaña aprobada.", 403);
  }
  if (accion === "enviar_revision" && estado === "borrador") return "en_revision";
  if (accion === "aprobar" && estado === "en_revision") return "aprobada";
  if (accion === "devolver_borrador" && (estado === "en_revision" || estado === "aprobada")) return "borrador";
  if (accion === "archivar" && estado !== "archivada") return "archivada";
  throw new ErrorMarketing("La campaña cambió de estado. Recarga para ver las acciones disponibles.", 409);
}

export function validarFiltrosCampanas(parametros: URLSearchParams) {
  const q = (parametros.get("q") ?? "").trim();
  if (q.length > 120) throw new ErrorMarketing("Busca con un texto de hasta 120 caracteres.");
  const estado = parametros.get("estado") || null;
  if (estado && !Object.hasOwn(ESTADOS_MARKETING, estado)) throw new ErrorMarketing("Elige un estado válido.");
  const pagina = parametros.get("page") ?? "1";
  if (!/^[1-9]\d*$/.test(pagina) || Number(pagina) > 1_000_000) throw new ErrorMarketing("La página solicitada no es válida.");
  return { q, estado: estado as EstadoCampana | null, page: Number(pagina), limite: 24 };
}
