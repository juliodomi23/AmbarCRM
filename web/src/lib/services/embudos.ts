import { db } from "@/lib/db";
import { LIMITE_PANEL } from "@/lib/paginacion";

/** Lista de embudos activos (para el selector). */
export function listarEmbudos() {
  return db.embudo.findMany({ where: { activo: true }, orderBy: { orden: "asc" } });
}

/** La búsqueda y la paginación incluyen abiertos, ganados y perdidos. */
export async function getEmbudoConTarjetas(embudoId: bigint, opciones: { q?: string; pagina?: number } = {}) {
  const q = (opciones.q ?? "").trim().slice(0,100);
  const where = q ? { OR: [{ titulo: { contains: q, mode: "insensitive" as const } }, { contacto: { nombre: { contains: q, mode: "insensitive" as const } } }, { notas: { some: { contenido: { contains: q, mode: "insensitive" as const } } } }] } : {};
  const embudo = await db.embudo.findUnique({
    where: { id: embudoId },
    include: {
      etapas: {
        orderBy: { orden: "asc" },
        include: {
          _count: { select: { oportunidades: { where } } },
          oportunidades: {
            where,
            take: LIMITE_PANEL,
            skip: (Math.max(1, opciones.pagina ?? 1)-1)*LIMITE_PANEL,
            orderBy: [{ orden: "asc" }, { id: "asc" }],
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
