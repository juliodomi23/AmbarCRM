import { db } from "@/lib/db";
import { rangoRecordatorio } from "@/lib/citas";

/**
 * Citas a las que les toca recordatorio, de la empresa actual. Se filtra por fecha en la
 * consulta (índice citas_org_inicio_idx): las citas pasadas o sin teléfono nunca bloquean
 * a las siguientes.
 */
export const MAX_INTENTOS_RECORDATORIO = 3;
export const ESPERA_RECORDATORIO_MS = 15 * 60_000;

export function filtroRecordatorio(anticipacionHoras: number, ahora = new Date()) {
  return {
    recordatorioEnviadoAt: null,
    recordatorioIntentos: { lt: MAX_INTENTOS_RECORDATORIO },
    OR: [{ recordatorioIntentadoAt: null }, { recordatorioIntentadoAt: { lte: new Date(+ahora - ESPERA_RECORDATORIO_MS) } }],
    estado: { in: ["programada", "confirmada"] as ("programada" | "confirmada")[] },
    inicio: rangoRecordatorio(anticipacionHoras, ahora),
  };
}

export function citasPorRecordar(anticipacionHoras: number, ahora = new Date(), despuesId = 0n) {
  return db.cita.findMany({
    where: {
      ...filtroRecordatorio(anticipacionHoras, ahora),
      id: { gt: despuesId },
    },
    include: { contacto: true, conversacion: { include: { canal: true } } },
    orderBy: { id: "asc" },
    take: 100,
  });
}
