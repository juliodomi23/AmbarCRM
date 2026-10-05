import { db } from "@/lib/db";

export async function obtenerContadoresShell(userId: bigint | null) {
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const [noLeidos, tareasVencidas] = await Promise.all([
    db.conversacion.aggregate({ _sum: { noLeidos: true }, where: { estado: { not: "cerrada" } } }),
    db.tarea.count({
      where: {
        completada: false,
        venceAt: { lt: inicioHoy },
        ...(userId ? { responsableId: userId } : {})
      }
    })
  ]);
  return { noLeidos: noLeidos._sum.noLeidos ?? 0, tareasVencidas };
}
