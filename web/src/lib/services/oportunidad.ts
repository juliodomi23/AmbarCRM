import { db } from "@/lib/db";

export function getOportunidad(id: bigint) {
  return db.oportunidad.findUnique({
    where: { id },
    include: {
      contacto: { include: { conversaciones: { select: { id: true }, take: 1 } } },
      etapa: true,
      embudo: true,
      responsable: true,
      notas: { orderBy: { createdAt: "desc" }, include: { usuario: true } },
      tareas: { orderBy: [{ completada: "asc" }, { venceAt: "asc" }], include: { responsable: true } },
      eventos: { orderBy: { createdAt: "desc" }, include: { usuario: true } }
    }
  });
}
