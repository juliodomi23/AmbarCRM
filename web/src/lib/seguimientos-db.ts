import { db } from "@/lib/db";

/** Días sin movimiento de etapa para considerar una oportunidad estancada (PR-VEN-001, POL-VEN-07). */
export const UMBRAL_DIAS_ESTANCADA = 3;

type TareaFila = {
  id: bigint; titulo: string; venceAt: Date | null;
  responsable: { nombre: string } | null;
  oportunidad: { id: bigint; titulo: string; contacto: { nombre: string } } | null;
};

export type TareaPendiente = {
  id: string; titulo: string; venceAt: string | null;
  responsable: string | null;
  oportunidad: { id: string; titulo: string; contacto: string } | null;
};

export type OportunidadEstancada = {
  id: string; titulo: string; etapa: string; diasEnEtapa: number;
  responsable: string | null; contacto: string; telefono: string | null;
};

export type Seguimientos = {
  tareasVencidas: TareaPendiente[];
  tareasHoy: TareaPendiente[];
  oportunidadesEstancadas: OportunidadEstancada[];
};

const selectTarea = {
  id: true, titulo: true, venceAt: true,
  responsable: { select: { nombre: true } },
  oportunidad: { select: { id: true, titulo: true, contacto: { select: { nombre: true } } } },
} as const;

function serializarTarea(t: TareaFila): TareaPendiente {
  return {
    id: String(t.id), titulo: t.titulo, venceAt: t.venceAt?.toISOString() ?? null,
    responsable: t.responsable?.nombre ?? null,
    oportunidad: t.oportunidad
      ? { id: String(t.oportunidad.id), titulo: t.oportunidad.titulo, contacto: t.oportunidad.contacto.nombre }
      : null,
  };
}

/** Lee tareas vencidas/para hoy y oportunidades estancadas de la empresa fijada por runWithOrg. Solo lectura. */
export async function seguimientosDeLaEmpresa(ahora = new Date()): Promise<Seguimientos> {
  const inicioHoy = new Date(ahora);
  inicioHoy.setHours(0, 0, 0, 0);
  const finHoy = new Date(ahora);
  finHoy.setHours(23, 59, 59, 999);
  const umbral = new Date(ahora.getTime() - UMBRAL_DIAS_ESTANCADA * 86_400_000);

  const [vencidas, hoy, estancadas] = await Promise.all([
    db.tarea.findMany({
      where: { completada: false, venceAt: { lt: inicioHoy } },
      orderBy: { venceAt: "asc" }, take: 200, select: selectTarea,
    }),
    db.tarea.findMany({
      where: { completada: false, venceAt: { gte: inicioHoy, lte: finHoy } },
      orderBy: { venceAt: "asc" }, take: 200, select: selectTarea,
    }),
    db.oportunidad.findMany({
      where: { estado: "abierto", etapa: { tipo: "normal" }, createdAt: { lte: umbral } },
      orderBy: { createdAt: "asc" }, take: 200,
      select: {
        id: true, titulo: true, createdAt: true,
        etapa: { select: { nombre: true } },
        responsable: { select: { nombre: true } },
        contacto: { select: { nombre: true, telefono: true } },
      },
    }),
  ]);

  return {
    tareasVencidas: vencidas.map(serializarTarea),
    tareasHoy: hoy.map(serializarTarea),
    oportunidadesEstancadas: estancadas.map((o) => ({
      id: String(o.id), titulo: o.titulo, etapa: o.etapa.nombre,
      // Mismo cálculo que ya usa el kanban (Board.tsx, embudos/page.tsx): días desde
      // createdAt, no desde el último cambio de etapa. Se mantiene igual a propósito
      // para no reportar un número distinto del que el usuario ya ve en pantalla.
      diasEnEtapa: Math.max(0, Math.floor((ahora.getTime() - o.createdAt.getTime()) / 86_400_000)),
      responsable: o.responsable?.nombre ?? null,
      contacto: o.contacto.nombre, telefono: o.contacto.telefono,
    })),
  };
}
