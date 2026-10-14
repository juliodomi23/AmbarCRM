import { Prisma } from "@prisma/client";
import { transaccionTenant } from "@/lib/retail-db";
import { configPanelAR, elegibleMRR, fechaAR, hoyAR, mesSiguiente, repartirComisiones, ZONA_AR } from "@/lib/contratos-cobros";
import { abonosCobro, saldoCobro } from "@/lib/ar-vistas";
import { instanteLocal } from "@/lib/reservas/horarios";
import { incluirContrato } from "@/lib/cobros-db";
import { LIMITE_PANEL } from "@/lib/paginacion";

export function panelAR(orgId: bigint, fecha = hoyAR()) {
  return transaccionTenant(orgId, async (tx) => {
    const hoy = fechaAR(fecha)!;
    const mes = fechaAR(fecha.slice(0,7) + "-01")!;
    const siguiente = mesSiguiente(fecha);
    const inicioPagos = instanteLocal(mes.toISOString().slice(0,10), 0, ZONA_AR);
    const finPagos = instanteLocal(siguiente.toISOString().slice(0,10), 0, ZONA_AR);
    const fin7 = new Date(hoy.getTime() + 7 * 86400000);
    const config = configPanelAR((await tx.moduloOrg.findFirst({ where: { clave: "panel_ar" } }))?.config);
    const idsPagos = await tx.$queryRaw<{id: bigint}[]>`SELECT id FROM cobros WHERE estado <> 'cancelado' AND (
      (jsonb_array_length(pagos) > 0 AND EXISTS (SELECT 1 FROM jsonb_array_elements(pagos) p WHERE
        (p->>'pagadoEn')::timestamptz >= ${inicioPagos} AND (p->>'pagadoEn')::timestamptz < ${finPagos}))
      OR (jsonb_array_length(pagos)=0 AND estado='pagado' AND pagado_en >= ${inicioPagos} AND pagado_en < ${finPagos}))`;
    const abiertos = { estado: { in: ["pendiente", "vencido"] } };
    const [contratos, calendario, cargosPagados, pipeline, pendientes, totalPendientes, totalCalendario, totales] = await Promise.all([
      tx.contrato.findMany({ select: { contactoId: true, estado: true, mensualidad: true, diaCobro: true, inicioMensualidad: true, fechaBaja: true } }),
      tx.cobro.findMany({ take: LIMITE_PANEL, where: { estado: { not: "cancelado" }, vence: { gte: mes, lt: siguiente } }, include: incluirContrato, orderBy: [{ vence: "asc" }, { id: "asc" }] }),
      tx.cobro.findMany({ where: { id: { in: idsPagos.map(p => p.id) } }, include: incluirContrato }),
      tx.oportunidad.groupBy({ by: ["etapaId"], where: { estado: "abierto" }, _sum: { valor: true } }),
      tx.cobro.findMany({ take: LIMITE_PANEL, where: abiertos, include: incluirContrato, orderBy: [{ vence: { sort: "asc", nulls: "last" } }, { id: "asc" }] }),
      tx.cobro.count({ where: abiertos }),
      tx.cobro.count({ where: { estado: { not: "cancelado" }, vence: { gte: mes, lt: siguiente } } }),
      tx.$queryRaw<{ vencido: Prisma.Decimal; semana: Prisma.Decimal; mes: Prisma.Decimal; incobrable: Prisma.Decimal; sin: bigint }[]>`
        SELECT COALESCE(SUM(monto-monto_pagado) FILTER(WHERE estado IN ('pendiente','vencido') AND vence < ${hoy}),0) AS vencido,
          COALESCE(SUM(monto-monto_pagado) FILTER(WHERE estado IN ('pendiente','vencido') AND vence BETWEEN ${hoy} AND ${fin7}),0) AS semana,
          COALESCE(SUM(monto-monto_pagado) FILTER(WHERE estado IN ('pendiente','vencido') AND vence >= ${mes} AND vence < ${siguiente}),0) AS mes,
          COALESCE(SUM(monto-monto_pagado) FILTER(WHERE estado='incobrable'),0) AS incobrable,
          COUNT(*) FILTER(WHERE estado IN ('pendiente','vencido') AND vence IS NULL) AS sin FROM cobros`,
    ]);
    const pagos = cargosPagados.flatMap(cobro => abonosCobro(cobro).filter(abono => abono.pagadoEn >= inicioPagos && abono.pagadoEn < finPagos).map(abono => ({ ...cobro, ...abono, cobroId: cobro.id })));
    const periodos = pagos.filter(p => p.concepto === "mensualidad").map(p => ({ contrato: { contactoId: p.contrato.contactoId }, periodo: p.periodo }));
    const cargosPrevios = periodos.length ? await tx.cobro.findMany({ where: { estado: { not: "cancelado" }, concepto: "mensualidad", OR: periodos }, include: incluirContrato }) : [];
    const previos = cargosPrevios.flatMap(c => abonosCobro(c).filter(a => a.pagadoEn < finPagos && !pagos.some(p => p.id === a.id)).map(a => ({ ...c, ...a })));
    const comisiones = repartirComisiones([...previos, ...pagos].map(p => ({ ...p, contactoId: p.contrato.contactoId })), config);
    const sumar = (montos: (Prisma.Decimal | null)[]) => montos.reduce<Prisma.Decimal>((s,m) => s.plus(m ?? 0), new Prisma.Decimal(0));
    const activos = contratos.filter(c => elegibleMRR(c,hoy));
    const futuros = contratos.filter(c => c.mensualidad?.gt(0) && ["en_desarrollo","en_pruebas","produccion"].includes(c.estado ?? "") && !elegibleMRR(c,hoy) && (!c.fechaBaja || c.fechaBaja > hoy));
    const etapas = await tx.etapa.findMany({ where: { id: { in: pipeline.map(p => p.etapaId) } }, orderBy: { orden: "asc" } });
    const actual = comisiones.filter(c => pagos.some(p => p.id === c.id));
    return {
      fecha, mes: fecha.slice(0,7), mrr: sumar(activos.map(c => c.mensualidad)), mrrProyectado: sumar([...activos,...futuros].map(c => c.mensualidad)),
      clientesProduccion: new Set(contratos.filter(c => c.estado === "produccion" && (!c.fechaBaja || c.fechaBaja > hoy)).map(c => String(c.contactoId))).size,
      clientesDesarrollo: new Set(contratos.filter(c => ["en_desarrollo","en_pruebas"].includes(c.estado ?? "")).map(c => String(c.contactoId))).size,
      sinDiaCobro: contratos.filter(c => c.mensualidad?.gt(0) && c.diaCobro === null && !["baja","incobrable"].includes(c.estado ?? "")).length,
      vencido: totales[0].vencido, vence7Dias: totales[0].semana, venceMes: totales[0].mes, incobrable: totales[0].incobrable, sinVencimiento: Number(totales[0].sin),
      cobradoMes: sumar(pagos.map(p => p.monto)), calendario: calendario.map(c => ({ ...c, saldo: saldoCobro(c) })), pendientes: pendientes.map(c => ({ ...c, saldo: saldoCobro(c) })), totalPendientes, totalCalendario,
      pipeline: etapas.map(e => ({ etapa: e.nombre, valor: pipeline.find(p => p.etapaId === e.id)?._sum.valor ?? new Prisma.Decimal(0) })),
      pagos: pagos.map(p => ({ ...p, comision: comisiones.find(c => c.id === p.id)! })),
      comisiones: { cto: sumar(actual.map(c => c.cto)), ceo: sumar(actual.map(c => c.ceo)), creditoIA: sumar(actual.map(c => c.creditoIA)) },
    };
  });
}
