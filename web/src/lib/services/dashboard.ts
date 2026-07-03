import { db } from "@/lib/db";

const num = (v: unknown) => (v == null ? 0 : Number(v));

/** Estado de los primeros pasos del tenant (para el checklist de onboarding en Inicio). */
export async function getPrimerosPasos() {
  const [canalConectado, embudos, usuarios, contactos] = await Promise.all([
    db.canalWhatsapp.count({ where: { estado: "conectado", activo: true } }),
    db.embudo.count({ where: { activo: true } }),
    db.usuario.count({ where: { activo: true } }),
    db.contacto.count()
  ]);
  return {
    whatsapp: canalConectado > 0,
    embudo: embudos > 0,
    equipo: usuarios > 1,
    contacto: contactos > 0
  };
}

/** Métricas para la home: pipeline, cierres del mes, conversión, pipeline por etapa y ranking. */
export async function getMetricasDashboard() {
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const finHoy = new Date();
  finHoy.setHours(23, 59, 59, 999);

  const [pipeline, ganadas, perdidasCount, leadsMes, convAbiertas, tareasUrgentes, embudo, porEtapaRaw, rankingRaw, usuarios, csat] =
    await Promise.all([
      db.oportunidad.aggregate({ _sum: { valor: true }, _count: true, where: { estado: "abierto" } }),
      db.oportunidad.aggregate({ _sum: { valor: true }, _count: true, where: { estado: "ganado", closedAt: { gte: inicioMes } } }),
      db.oportunidad.count({ where: { estado: "perdido", closedAt: { gte: inicioMes } } }),
      db.contacto.count({ where: { createdAt: { gte: inicioMes } } }),
      db.conversacion.count({ where: { estado: "abierta" } }),
      db.tarea.count({ where: { completada: false, venceAt: { lte: finHoy } } }),
      db.embudo.findFirst({ where: { activo: true }, orderBy: { orden: "asc" }, include: { etapas: { orderBy: { orden: "asc" } } } }),
      db.oportunidad.groupBy({ by: ["etapaId"], where: { estado: "abierto" }, _sum: { valor: true }, _count: true }),
      db.oportunidad.groupBy({ by: ["responsableId"], where: { estado: "ganado", closedAt: { gte: inicioMes } }, _sum: { valor: true }, _count: true }),
      db.usuario.findMany({ select: { id: true, nombre: true } }),
      db.conversacion.aggregate({ _avg: { csatScore: true }, _count: { csatScore: true }, where: { csatScore: { not: null }, csatEnviadoAt: { gte: inicioMes } } })
    ]);

  // Pipeline por etapa del embudo principal.
  const porEtapaMap = new Map(porEtapaRaw.map((r) => [r.etapaId.toString(), { valor: num(r._sum.valor), count: r._count }]));
  const porEtapa = (embudo?.etapas ?? []).map((e) => ({
    nombre: e.nombre,
    color: e.color,
    ...(porEtapaMap.get(e.id.toString()) ?? { valor: 0, count: 0 })
  }));

  // Ranking de agentes por ventas ganadas del mes.
  const nombreUsuario = new Map(usuarios.map((u) => [u.id.toString(), u.nombre]));
  const ranking = rankingRaw
    .map((r) => ({
      nombre: r.responsableId ? nombreUsuario.get(r.responsableId.toString()) ?? "—" : "Sin asignar",
      count: r._count,
      valor: num(r._sum.valor)
    }))
    .sort((a, b) => b.valor - a.valor);

  const ganadasCount = ganadas._count;
  const conversion = ganadasCount + perdidasCount > 0 ? Math.round((ganadasCount / (ganadasCount + perdidasCount)) * 100) : 0;

  return {
    pipelineValor: num(pipeline._sum.valor),
    pipelineCount: pipeline._count,
    ganadasCount,
    ganadasValor: num(ganadas._sum.valor),
    perdidasCount,
    conversion,
    leadsMes,
    convAbiertas,
    tareasUrgentes,
    embudoNombre: embudo?.nombre ?? null,
    porEtapa,
    ranking,
    csatPromedio: csat._avg.csatScore ? Math.round(Number(csat._avg.csatScore) * 10) / 10 : null,
    csatRespuestas: csat._count.csatScore
  };
}
