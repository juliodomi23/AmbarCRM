import type { Prisma } from "@prisma/client";
import { transaccionTenant } from "@/lib/retail-db";
import { dispararEvento } from "@/lib/disparar-evento";

export async function actualizarConversacion(orgId: bigint, id: bigint, data: Prisma.ConversacionUncheckedUpdateInput) {
  const { antes, despues } = await transaccionTenant(orgId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM conversaciones WHERE id = ${id} FOR UPDATE`;
    const antes = await tx.conversacion.findUniqueOrThrow({ where: { id } });
    const despues = await tx.conversacion.update({ where: { id }, data });
    return { antes, despues };
  });
  if (antes.estado !== despues.estado) dispararEvento(orgId, "conversacion.estado_cambiado", {
    id: String(id), conversacion_id: String(id), contacto_id: String(despues.contactoId),
    estado: despues.estado, estado_anterior: antes.estado,
  }, { conversacionId: String(id), origen: "agente" });
  return despues;
}
