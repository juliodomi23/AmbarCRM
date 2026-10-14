import { Prisma } from "@prisma/client";
import { transaccionTenant } from "@/lib/retail-db";
import { configPanelAR, elegibleMRR, fechaAR, hoyAR, mesSiguiente, repartirComisiones, ZONA_AR } from "@/lib/contratos-cobros";
import { instanteLocal } from "@/lib/reservas/horarios";

export function panelAR(orgId: bigint, fecha = hoyAR()) {
  return transaccionTenant(orgId, async (tx) => {
    const hoy = fechaAR(fecha)!;
    const mes = fechaAR(`${fecha.slice(0, 7)}-01`)!;
    const siguiente = mesSiguiente(fecha);
    const fin7 = new Date(hoy.getTime() + 7 * 86400000);
    const configModulo = await tx.moduloOrg.findFirst({ where: { clave: "panel_ar" } });
    const config = configPanelAR(configModulo?.config);
    const [contratos, calendario, pagos, pipeline, totales] = await Promise.all([
      tx.contrato.findMany({ select: { contactoId: true, estado: true, mensualidad: true, diaCobro: true, inicioMensualidad: true, fechaBaja: true } }),
      tx.cobro.findMany({ where: { vence: { gte: mes, lt: siguiente } }, include: { contrato: { include: { contacto: { select: { nombre: true } } } } }, orderBy: [{ vence: "asc" }, { id: "asc" }] }),
      tx.cobro.findMany({ where: { estado: "pagado", pagadoEn: { gte: instanteLocal(mes.toISOString().slice(0, 10), 0, ZONA_AR), lt: instanteLocal(siguiente.toISOString().slice(0, 10), 0, ZONA_AR) } }, include: { contrato: { include: { contacto: { select: { nombre: true } } } } }, orderBy: { id: "asc" } }),
      tx.oportunidad.groupBy({ by: ["etapaId"], where: { estado: "abierto" }, _sum: { valor: true }, _count: { _all: true } }),
      Promise.all([
        tx.cobro.aggregate({ where: { estado: { in: ["pendiente", "vencido"] }, vence: { lt: hoy } }, _sum: { monto: true } }),
        tx.cobro.aggregate({ where: { estado: { in: ["pendiente", "vencido"] }, vence: { gte: hoy, lte: fin7 } }, _sum: { monto: true } }),
        tx.cobro.aggregate({ where: { estado: { in: ["pendiente", "vencido"] }, vence: { gte: mes, lt: siguiente } }, _sum: { monto: true } }),
        tx.cobro.aggregate({ where: { estado: "incobrable" }, _sum: { monto: true } }),
        tx.cobro.count({ where: { estado: { in: ["pendiente", "vencido"] }, vence: null } }),
      ]),
    ]);
    const etapas = await tx.etapa.findMany({ where: { id: { in: pipeline.map((fila) => fila.etapaId) } }, select: { id: true, nombre: true, orden: true }, orderBy: { orden: "asc" } });
    // Incluir pagos del mismo mes de servicio cobrados antes evita descontar IA otra vez
    // cuando el segundo contrato del cliente se liquida en un mes posterior.
    const periodos = pagos.filter((pago) => pago.concepto === "mensualidad").map((pago) => ({ contrato: { contactoId: pago.contrato.contactoId }, periodo: pago.periodo }));
    const previos = periodos.length ? await tx.cobro.findMany({
      where: { estado: "pagado", concepto: "mensualidad", OR: periodos, pagadoEn: { lt: instanteLocal(siguiente.toISOString().slice(0, 10), 0, ZONA_AR) }, id: { notIn: pagos.map((pago) => pago.id) } },
      include: { contrato: { select: { contactoId: true } } },
    }) : [];
    const comisiones = repartirComisiones([...previos, ...pagos].map((pago) => ({ ...pago, contactoId: pago.contrato.contactoId })), config);
    const sumar = (montos: (Prisma.Decimal | null)[]) => montos.reduce<Prisma.Decimal>((total, monto) => total.plus(monto ?? 0), new Prisma.Decimal(0));
    const activos = contratos.filter((contrato) => elegibleMRR(contrato, hoy));
    const futuros = contratos.filter((contrato) => contrato.mensualidad?.gt(0) && ["en_desarrollo", "en_pruebas", "produccion"].includes(contrato.estado ?? "") && !elegibleMRR(contrato, hoy) && (!contrato.fechaBaja || contrato.fechaBaja > hoy));
    return {
      fecha, mes: fecha.slice(0, 7),
      mrr: sumar(activos.map((contrato) => contrato.mensualidad)),
      mrrProyectado: sumar([...activos, ...futuros].map((contrato) => contrato.mensualidad)),
      clientesProduccion: new Set(contratos.filter((contrato) => contrato.estado === "produccion" && (!contrato.fechaBaja || contrato.fechaBaja > hoy)).map((contrato) => String(contrato.contactoId))).size,
      clientesDesarrollo: new Set(contratos.filter((contrato) => contrato.estado === "en_desarrollo" || contrato.estado === "en_pruebas").map((contrato) => String(contrato.contactoId))).size,
      sinDiaCobro: contratos.filter((contrato) => contrato.mensualidad?.gt(0) && contrato.diaCobro === null && !["baja", "incobrable"].includes(contrato.estado ?? "")).length,
      vencido: totales[0]._sum.monto ?? new Prisma.Decimal(0), vence7Dias: totales[1]._sum.monto ?? new Prisma.Decimal(0),
      venceMes: totales[2]._sum.monto ?? new Prisma.Decimal(0), incobrable: totales[3]._sum.monto ?? new Prisma.Decimal(0), sinVencimiento: totales[4],
      cobradoMes: sumar(pagos.map((pago) => pago.monto)), calendario,
      pipeline: etapas.map((etapa) => ({ etapa: etapa.nombre, valor: pipeline.find((fila) => fila.etapaId === etapa.id)?._sum.valor ?? new Prisma.Decimal(0) })),
      pagos: pagos.map((pago) => ({ ...pago, comision: comisiones.find((fila) => fila.id === pago.id)! })),
      comisiones: {
        cto: sumar(comisiones.filter((fila) => pagos.some((pago) => pago.id === fila.id)).map((fila) => fila.cto)),
        ceo: sumar(comisiones.filter((fila) => pagos.some((pago) => pago.id === fila.id)).map((fila) => fila.ceo)),
        creditoIA: sumar(comisiones.filter((fila) => pagos.some((pago) => pago.id === fila.id)).map((fila) => fila.creditoIA)),
      },
    };
  });
}
