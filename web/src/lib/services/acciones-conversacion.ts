import type { Prisma } from "@prisma/client";

export function agregarEtiquetaContacto(tx: Pick<Prisma.TransactionClient, "contactoEtiqueta">, contactoId: bigint, etiquetaId: bigint) {
  return tx.contactoEtiqueta.upsert({
    where: { contactoId_etiquetaId: { contactoId, etiquetaId } }, update: {}, create: { contactoId, etiquetaId },
  });
}

export function modificarConversacion(tx: Pick<Prisma.TransactionClient, "conversacion">, id: bigint, data: Prisma.ConversacionUncheckedUpdateInput) {
  return tx.conversacion.update({ where: { id }, data });
}
