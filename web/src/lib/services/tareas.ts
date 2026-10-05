import { db } from "@/lib/db";

export function listarTareas() {
  return db.tarea.findMany({
    orderBy: [{ completada: "asc" }, { venceAt: "asc" }],
    include: {
      responsable: true,
      oportunidad: { include: { contacto: true } }
    }
  });
}

/**
 * Cuenta tareas urgentes (sin completar y que vencen hoy o antes) para el badge del menú.
 * Si se pasa userId, solo las del usuario; si no, todas (vista admin).
 */
export function contarTareasUrgentes(userId: bigint | null) {
  const finHoy = new Date();
  finHoy.setHours(23, 59, 59, 999);
  return db.tarea.count({
    where: {
      completada: false,
      venceAt: { lte: finHoy }, // lte ya excluye las que no tienen fecha (null)
      ...(userId ? { responsableId: userId } : {})
    }
  });
}
