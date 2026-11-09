// Reglas puras del módulo Contenido: flujo editorial, permisos y semana de publicación.
const ZONA = "America/Mexico_City";

export const ESTADOS_CONTENIDO = ["idea", "redaccion", "revision", "cambios", "aprobado", "programado", "publicado"] as const;
export type EstadoContenido = (typeof ESTADOS_CONTENIDO)[number];

export const CANALES_CONTENIDO = ["instagram", "facebook", "linkedin", "tiktok", "whatsapp", "blog", "email", "otro"] as const;
export type CanalContenido = (typeof CANALES_CONTENIDO)[number];

export const FORMATOS_CONTENIDO = ["imagen", "video", "carrusel", "texto", "reel", "historia", "articulo", "otro"] as const;
export type FormatoContenido = (typeof FORMATOS_CONTENIDO)[number];

const SIGUIENTES: Record<EstadoContenido, EstadoContenido[]> = {
  idea: ["redaccion"],
  redaccion: ["revision"],
  revision: ["cambios", "aprobado"],
  cambios: ["revision"],
  aprobado: ["programado", "revision"],
  programado: ["publicado", "aprobado"],
  publicado: [],
};

type Partes = { y: number; m: number; d: number };

function partesTexto(fecha: string): Partes {
  const partes = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(fecha.trim());
  if (!partes) return { y: 1970, m: 1, d: 1 };
  return { y: Number(partes[1]), m: Number(partes[2]), d: Number(partes[3] ?? 1) };
}

function partesMexico(fecha: Date): Partes {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(fecha).map((parte) => [parte.type, parte.value]),
  );
  return { y: Number(partes.year), m: Number(partes.month), d: Number(partes.day) };
}

function iso(anio: number, mes: number, dia: number) {
  return new Date(Date.UTC(anio, mes - 1, dia)).toISOString().slice(0, 10);
}

function sumarDias(fecha: string, dias: number) {
  const base = new Date(`${fecha}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

function clavePublicacion(valor: string | Date | null | undefined): string | null {
  if (valor == null) return null;
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) return valor.trim();
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  const { y, m, d } = partesMexico(fecha);
  return iso(y, m, d);
}

export function transicionContenidoValida(actual: string, siguiente: string) {
  if (actual === siguiente) return true;
  if (!ESTADOS_CONTENIDO.includes(siguiente as EstadoContenido)) return false;
  return (SIGUIENTES[actual as EstadoContenido] ?? []).includes(siguiente as EstadoContenido);
}

/** Aprueba un administrador, Dirección comercial o un revisor asignado distinto del redactor. */
export function puedeAprobar(
  pieza: { redactorId: string | bigint | null; revisorId: string | bigint | null },
  usuarioId: string | bigint | null,
  puesto: string | undefined,
  rol: string | undefined,
) {
  if (rol === "admin" || puesto === "Administrador" || puesto === "Dirección comercial") return true;
  if (usuarioId == null || pieza.revisorId == null || pieza.redactorId == null) return false;
  return String(pieza.revisorId) === String(usuarioId) && String(pieza.redactorId) !== String(usuarioId);
}

export function esRevisorDe(
  pieza: { revisorId: string | bigint | null },
  usuarioId: string | bigint | null,
) {
  return usuarioId != null && pieza.revisorId != null && String(pieza.revisorId) === String(usuarioId);
}

export function puedeEditarPieza(
  pieza: { redactorId: string | bigint | null; revisorId: string | bigint | null },
  usuarioId: string | bigint | null,
  puesto: string | undefined,
  rol: string | undefined,
) {
  if (rol === "admin" || puesto === "Administrador" || puesto === "Dirección comercial") return true;
  if (usuarioId == null) return false;
  return String(pieza.redactorId) === String(usuarioId) || String(pieza.revisorId) === String(usuarioId);
}

/** Al cambiar el copy de una pieza aprobada o programada, regresa a revisión. */
export function debeVolverARevision(estado: string, copyAnterior: string, copyNuevo: string) {
  return ["aprobado", "programado"].includes(estado) && copyAnterior !== copyNuevo;
}

export function semanaDe(fecha: string | Date) {
  const { y, m, d } = typeof fecha === "string" ? partesTexto(fecha) : partesMexico(fecha);
  const clave = iso(y, m, d);
  const diaSemana = new Date(`${clave}T00:00:00.000Z`).getUTCDay();
  const inicio = sumarDias(clave, -((diaSemana + 6) % 7));
  return { inicio, fin: sumarDias(inicio, 6) };
}

export function piezasDeLaSemana<T extends { fechaPublicacion: string | Date | null }>(piezas: T[], fecha: string | Date) {
  const { inicio, fin } = semanaDe(fecha);
  return piezas.filter((pieza) => {
    const clave = clavePublicacion(pieza.fechaPublicacion);
    return clave !== null && clave >= inicio && clave <= fin;
  });
}

export function validarEnlaceMaterial(valor: unknown) {
  const texto = String(valor ?? "").trim();
  if (!texto) return true;
  try {
    const url = new URL(texto);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function etiquetaEstadoContenido(estado: string) {
  return ({
    idea: "Idea",
    redaccion: "En redacción",
    revision: "Por revisar",
    cambios: "Cambios solicitados",
    aprobado: "Aprobado",
    programado: "Programado",
    publicado: "Publicado",
  } as Record<string, string>)[estado] ?? estado;
}

export function etiquetaCanal(canal: string) {
  return ({
    instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok",
    whatsapp: "WhatsApp", blog: "Blog", email: "Correo", otro: "Otro",
  } as Record<string, string>)[canal] ?? canal;
}

export function etiquetaFormato(formato: string) {
  return ({
    imagen: "Imagen", video: "Video", carrusel: "Carrusel", texto: "Texto",
    reel: "Reel", historia: "Historia", articulo: "Artículo", otro: "Otro",
  } as Record<string, string>)[formato] ?? formato;
}
