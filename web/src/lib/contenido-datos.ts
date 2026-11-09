import { db } from "@/lib/db";

/** Datos compartidos por las cuatro vistas de Contenido (server components). */
export async function datosContenido() {
  const [piezas, usuarios, campanas, contactos] = await Promise.all([
    db.contenidoPieza.findMany({
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

export function hoyMexico() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
