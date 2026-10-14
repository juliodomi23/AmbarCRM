import { Prisma } from "@prisma/client";
import { transaccionTenant } from "@/lib/retail-db";

export async function cobradoRegistrado(tx: Prisma.TransactionClient, where: Prisma.CobroWhereInput = {}) {
  const [abonos, historicos] = await Promise.all([
    tx.cobro.aggregate({
      where: { AND: [where, { estado: { notIn: ["cancelado", "incobrable"] } }] },
      _sum: { montoPagado: true },
    }),
    tx.cobro.aggregate({
      where: { AND: [where, { estado: "pagado", pagos: { equals: [] } }] },
      _sum: { monto: true },
    }),
  ]);
  return (abonos._sum.montoPagado ?? new Prisma.Decimal(0)).plus(historicos._sum.monto ?? 0);
}

export function resumenCobrosCliente(orgId: bigint, contactoId: bigint, contratoId: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    const where: Prisma.CobroWhereInput = { contrato: { contactoId } };
    const [totalCobrado, cobradoContrato, contratos, abiertos, mensualidadesPagadas, fechas] = await Promise.all([
      cobradoRegistrado(tx, where),
      cobradoRegistrado(tx, { AND: [where, { contratoId }] }),
      tx.contrato.count({ where: { contactoId } }),
      tx.cobro.aggregate({
        where: { AND: [where, { estado: { in: ["pendiente", "vencido"] } }] },
        _sum: { monto: true, montoPagado: true },
      }),
      tx.cobro.count({ where: { AND: [where, { concepto: "mensualidad", estado: "pagado" }] } }),
      tx.$queryRaw<Array<{ primerPago: Date | null }>>`
        SELECT MIN(fecha) AS "primerPago"
        FROM cobros c
        JOIN contratos contrato ON contrato.id = c.contrato_id
        CROSS JOIN LATERAL (
          SELECT c.pagado_en AS fecha
          WHERE c.monto_pagado > 0 OR c.estado = 'pagado'
          UNION ALL
          SELECT (pago->>'pagadoEn')::timestamptz
          FROM jsonb_array_elements(c.pagos) pago
          WHERE (pago->>'monto')::numeric > 0
        ) pagos
        WHERE contrato.contacto_id = ${contactoId}
          AND c.estado NOT IN ('cancelado', 'incobrable')
      `,
    ]);
    return {
      totalCobrado,
      cobradoContrato,
      contratos,
      porCobrar: (abiertos._sum.monto ?? new Prisma.Decimal(0)).minus(abiertos._sum.montoPagado ?? 0),
      clienteDesde: fechas[0].primerPago,
      mensualidadesPagadas,
    };
  });
}

export type ResumenCobrosCliente = Awaited<ReturnType<typeof resumenCobrosCliente>>;
