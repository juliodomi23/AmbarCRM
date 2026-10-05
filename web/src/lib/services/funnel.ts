import { db } from "@/lib/db";

/** Embudo principal (primer activo por orden) con sus etapas ordenadas. */
async function embudoPrincipal() {
  return db.embudo.findFirst({
    where: { activo: true },
    orderBy: { orden: "asc" },
    include: { etapas: { orderBy: { orden: "asc" } } }
  });
}

/** La oportunidad abierta más reciente de un contacto (la que el bot manipula). */
function oportunidadAbierta(contactoId: bigint) {
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
export async function moverLeadAEtapa(contactoId: bigint, nombreEtapa: string, tituloFallback: string) {
  const embudo = await embudoPrincipal();
  if (!embudo) return { ok: false as const, error: "no hay embudo configurado" };

  const objetivo = embudo.etapas.find((e) => e.nombre.toLowerCase().trim() === nombreEtapa.toLowerCase().trim());
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
