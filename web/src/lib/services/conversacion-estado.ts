import type { Conversacion, Prisma } from "@prisma/client";
import { transaccionTenant } from "@/lib/retail-db";
import { dispararEvento } from "@/lib/disparar-evento";
import { modificarConversacion } from "@/lib/services/acciones-conversacion";

export async function actualizarConversacion(orgId: bigint, id: bigint, data: Prisma.ConversacionUncheckedUpdateInput,
  origen: "agente" | "bot" = "agente", observar?: (antes: Conversacion, despues: Conversacion) => void) {
  const { antes, despues, canal } = await transaccionTenant(orgId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM conversaciones WHERE id = ${id} FOR UPDATE`;
    const antes = await tx.conversacion.findUniqueOrThrow({ where: { id } });
    const despues = origen === "bot" && data.estado === antes.estado && Object.keys(data).length === 1
      ? antes : await modificarConversacion(tx, id, data);
    const canal = despues.canalId ? await tx.canalWhatsapp.findUnique({ where: { id: despues.canalId }, select: { proveedor: true } }) : null;
    return { antes, despues, canal };
  });
  observar?.(antes, despues);
  if (antes.estado !== despues.estado) dispararEvento(orgId, "conversacion.estado_cambiado", {
    id: String(id), conversacion_id: String(id), contacto_id: String(despues.contactoId),
    estado: despues.estado, estado_anterior: antes.estado,
    canal_id: despues.canalId ? String(despues.canalId) : undefined, canal: canal?.proveedor,
    ...(origen === "bot" ? { origen: "bot" as const } : {})
  }, { conversacionId: String(id), origen });
  return despues;
}
