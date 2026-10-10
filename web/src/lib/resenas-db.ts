import { db, dbRaw, runWithOrg } from "@/lib/db";
import { configReservas } from "@/lib/reservas/servidor";
import { sumarDias, fechaLocal } from "@/lib/reservas/horarios";
import { configResenas, resumenResenas } from "@/lib/resenas";
import { transaccionTenant } from "@/lib/retail-db";

const SEMANAS_TENDENCIA = 12;

/** Empresa con reseñas activas y un enlace de Google válido, o null. Sin sesión: se valida aquí. */
export async function negocioResenas(slug: string) {
  const org = await dbRaw.org.findUnique({ where: { slug }, select: { id: true, activo: true, nombre: true } });
  if (!org?.activo) return null;
  const modulo = await runWithOrg(org.id, () =>
    db.moduloOrg.findFirst({ where: { clave: "resenas", activo: true }, select: { config: true } }),
  );
  const config = modulo ? configResenas(modulo.config) : null;
  return config?.enlaceGoogle ? { orgId: org.id, nombre: org.nombre, enlaceGoogle: config.enlaceGoogle } : null;
}

export function registrarResena(orgId: bigint, calificacion: number, origen: string) {
  return transaccionTenant(orgId, (tx) => tx.resena.create({ data: { calificacion, origen } }));
}

export async function panelResenas(orgId: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    const reservas = await tx.moduloOrg.findFirst({ where: { clave: "reservas_en_linea" }, select: { config: true } });
    const zona = configReservas(reservas?.config).zona;
    const hoy = fechaLocal(new Date(), zona);
    const [porCalificacion, porOrigen, recientes] = await Promise.all([
      tx.resena.groupBy({ by: ["calificacion"], _count: { _all: true } }),
      tx.resena.groupBy({ by: ["origen"], _count: { _all: true }, _avg: { calificacion: true } }),
      tx.resena.findMany({
        where: { createdAt: { gte: new Date(`${sumarDias(hoy, -(SEMANAS_TENDENCIA * 7))}T00:00:00Z`) } },
        select: { calificacion: true, origen: true, createdAt: true },
      }),
    ]);
    const distribucion = [0, 0, 0, 0, 0];
    let total = 0;
    let suma = 0;
    for (const fila of porCalificacion) {
      const cantidad = fila._count._all;
      distribucion[fila.calificacion - 1] = cantidad;
      total += cantidad;
      suma += cantidad * fila.calificacion;
    }
    return {
      zona,
      total,
      promedio: total ? suma / total : null,
      distribucion,
      tendencia: resumenResenas(recientes, zona).tendencia,
      origenes: porOrigen
        .map((fila) => ({ clave: fila.origen, total: fila._count._all, promedio: fila._avg.calificacion ?? 0 }))
        .sort((a, b) => b.total - a.total),
    };
  });
}
