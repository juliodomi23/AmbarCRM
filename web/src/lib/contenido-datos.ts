import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";

export type UsuarioContenido = { id?: string | bigint | null; puesto?: string | null; rol?: string | null };

/** Un revisor de contenido solo ve las piezas que le fueron asignadas para revisar. */
export function esSoloRevisorContenido(usuario?: UsuarioContenido | null) {
  return usuario?.puesto === "Revisor de contenido" && usuario.rol !== "admin";
}

/** Datos compartidos por las cuatro vistas de Contenido (server components). */
export async function datosContenido(usuario?: UsuarioContenido | null) {
  const revisorId = esSoloRevisorContenido(usuario) && usuario?.id != null ? BigInt(String(usuario.id)) : null;
  const [piezas, usuarios, campanas, contactos] = await Promise.all([
    db.contenidoPieza.findMany({
      where: revisorId != null ? { revisorId } : undefined,
      include: {
        comentarios: { orderBy: { creadoAt: "asc" } },
        contacto: { select: { id: true, nombre: true, empresa: true } },
      },
      orderBy: [{ fechaPublicacion: "asc" }, { updatedAt: "desc" }],
      take: 500,
    }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    db.campanaMarketing.findMany({ select: { id: true, nombre: true }, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.contacto.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" }, take: 500 }),
  ]);
  const nombres = new Map(usuarios.map((usuario) => [String(usuario.id), usuario.nombre]));
  return {
    piezas: piezas.map((pieza) => ({
      ...pieza,
      redactorNombre: pieza.redactorId ? nombres.get(String(pieza.redactorId)) ?? null : null,
      revisorNombre: pieza.revisorId ? nombres.get(String(pieza.revisorId)) ?? null : null,
    })),
    usuarios,
    campanas,
    contactos,
  };
}

/** Revisor asignado por defecto a un redactor, según la configuración del módulo. */
export async function revisorPorDefecto(redactorId: bigint): Promise<bigint | null> {
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "contenido", activo: true }, select: { config: true } });
  const mapa = (modulo?.config as Record<string, unknown> | null)?.revisoresPorRedactor;
  if (!mapa || typeof mapa !== "object" || Array.isArray(mapa)) return null;
  return aBigInt(String((mapa as Record<string, unknown>)[String(redactorId)] ?? ""));
}

export function hoyMexico() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
