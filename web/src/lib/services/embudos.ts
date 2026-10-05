import { db } from "@/lib/db";

/** Lista de embudos activos (para el selector). */
export function listarEmbudos() {
  return db.embudo.findMany({ where: { activo: true }, orderBy: { orden: "asc" } });
}

/** Un embudo con sus etapas y, en cada etapa, las oportunidades abiertas ordenadas. */
export async function getEmbudoConTarjetas(embudoId: bigint) {
  const embudo = await db.embudo.findUnique({
    where: { id: embudoId },
    include: {
      etapas: {
        orderBy: { orden: "asc" },
        include: {
          oportunidades: {
            orderBy: { orden: "asc" },
            include: {
              contacto: { include: { conversaciones: { take: 1, orderBy: { ultimoMensajeAt: "desc" } } } },
              responsable: true
            }
          }
        }
      }
    }
  });
  return embudo;
}
