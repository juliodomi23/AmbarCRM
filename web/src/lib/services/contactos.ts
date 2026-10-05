import { db } from "@/lib/db";

export function listarContactos() {
  return db.contacto.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      responsable: true,
      etiquetas: { include: { etiqueta: true } },
      _count: { select: { oportunidades: true } }
    }
  });
}

export function listarEtiquetas() {
  return db.etiqueta.findMany({ orderBy: { nombre: "asc" } });
}

/** Etiquetas con cuántos contactos (con teléfono) tiene cada una — para la difusión. */
export function listarEtiquetasConConteo() {
  return db.etiqueta.findMany({
    orderBy: { nombre: "asc" },
    include: { _count: { select: { contactos: true } } }
  });
}

export function listarUsuariosActivos() {
  return db.usuario.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } });
}
