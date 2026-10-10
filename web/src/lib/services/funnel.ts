import { db } from "@/lib/db";

/** Embudo principal (primer activo por orden) con sus etapas ordenadas. */
async function embudoPrincipal() {
  return db.embudo.findFirst({
    where: { activo: true },
    orderBy: { orden: "asc" },
    include: { etapas: { orderBy: { orden: "asc" } } }
  });
}

/** Embudo activo por nombre (sin importar mayúsculas), o el principal si no se pide uno. */
async function embudoDestino(nombre?: string) {
  if (!nombre?.trim()) return embudoPrincipal();
  const activos = await db.embudo.findMany({
    where: { activo: true },
    orderBy: { orden: "asc" },
    include: { etapas: { orderBy: { orden: "asc" } } }
  });
  return activos.find((e) => e.nombre.toLowerCase().trim() === nombre.toLowerCase().trim()) ?? null;
}

/** La oportunidad abierta más reciente de un contacto (la que el bot manipula). */
export function oportunidadAbierta(contactoId: bigint) {
  return db.oportunidad.findFirst({
    where: { contactoId, estado: "abierto" },
    orderBy: { createdAt: "desc" }
  });
}

/**
 * Crea una oportunidad (lead) en la primera etapa del embudo principal si el contacto
 * no tiene ya una abierta. Devuelve la oportunidad o null si no hay embudo.
 */
export async function crearLeadSiNoTiene(contactoId: bigint, responsableId: bigint | null, titulo: string) {
  const existe = await oportunidadAbierta(contactoId);
  if (existe) return existe;

  const embudo = await embudoPrincipal();
  const primera = embudo?.etapas[0];
  if (!embudo || !primera) return null;

  const op = await db.oportunidad.create({
    data: {
      contactoId,
      embudoId: embudo.id,
      etapaId: primera.id,
      titulo,
      responsableId,
      orden: 0,
      estado: "abierto"
    }
  });
  await db.evento.create({
    data: { oportunidadId: op.id, tipo: "creada", descripcion: "Lead creado automáticamente desde WhatsApp" }
  });
  return op;
}

/**
 * Mueve el lead del contacto a la etapa cuyo nombre coincida (case-insensitive).
 * Si no tiene oportunidad, la crea primero. Marca ganado/perdido según el tipo de etapa.
 * La usa el bot vía la tool `actualizar_funnel`.
 */
export async function moverLeadAEtapa(
  contactoId: bigint,
  nombreEtapa: string | null,
  tituloFallback: string,
  /** Embudo destino por nombre; sin él, el principal. Sin etapa, la primera del embudo. */
  nombreEmbudo?: string
) {
  const embudo = await embudoDestino(nombreEmbudo);
  if (!embudo) {
    if (!nombreEmbudo) return { ok: false as const, error: "no hay embudo configurado" };
    const activos = await db.embudo.findMany({ where: { activo: true }, orderBy: { orden: "asc" } });
    return { ok: false as const, error: `embudo '${nombreEmbudo}' no existe`, embudos: activos.map((e) => e.nombre) };
  }

  const objetivo = nombreEtapa
    ? embudo.etapas.find((e) => e.nombre.toLowerCase().trim() === nombreEtapa.toLowerCase().trim())
    : embudo.etapas[0];
  if (!objetivo) {
    return { ok: false as const, error: `etapa '${nombreEtapa}' no existe`, etapas: embudo.etapas.map((e) => e.nombre) };
  }

  let op = await oportunidadAbierta(contactoId);
  if (!op) {
    op = await db.oportunidad.create({
      data: { contactoId, embudoId: embudo.id, etapaId: objetivo.id, titulo: tituloFallback, orden: 0, estado: "abierto" }
    });
  }

  const nuevoEstado = objetivo.tipo === "ganado" ? "ganado" : objetivo.tipo === "perdido" ? "perdido" : "abierto";
  const op2 = await db.oportunidad.update({
    where: { id: op.id },
    data: {
      etapaId: objetivo.id,
      embudoId: embudo.id,
      estado: nuevoEstado,
      closedAt: nuevoEstado === "abierto" ? null : new Date()
    }
  });
  await db.evento.create({
    data: { oportunidadId: op.id, tipo: "etapa_cambio", descripcion: `Bot movió el lead a '${objetivo.nombre}'` }
  });

  return { ok: true as const, oportunidadId: op2.id.toString(), etapa: objetivo.nombre, estado: nuevoEstado };
}
