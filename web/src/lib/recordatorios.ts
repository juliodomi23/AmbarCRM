import { db } from "@/lib/db";
import { rangoRecordatorio } from "@/lib/citas";

/**
 * Citas a las que les toca recordatorio, de la empresa actual. Se filtra por fecha en la
 * consulta (índice citas_org_inicio_idx): las citas pasadas o sin teléfono nunca bloquean
 * a las siguientes.
 */
export function citasPorRecordar(anticipacionHoras: number, ahora = new Date()) {
  return db.cita.findMany({
    where: {
      recordatorioEnviadoAt: null,
      estado: { in: ["programada", "confirmada"] },
      inicio: rangoRecordatorio(anticipacionHoras, ahora),
    },
    include: { contacto: true, conversacion: { include: { canal: true } } },
    orderBy: { inicio: "asc" },
    take: 100,
  });
}
