import { Prisma } from "@prisma/client";

export class ErrorStockTaller extends Error {
  constructor(message: string) { super(message); }
}

export function cantidadesRefacciones(conceptos: readonly { refaccionId: bigint | null; cantidad: Prisma.Decimal | number | string }[]) {
  const cantidades = new Map<string, Prisma.Decimal>();
  for (const concepto of conceptos) {
    if (!concepto.refaccionId) continue;
    const key = String(concepto.refaccionId);
    cantidades.set(key, (cantidades.get(key) ?? new Prisma.Decimal(0)).plus(concepto.cantidad));
  }
  return cantidades;
}

/** Diferencia positiva consume inventario; una negativa lo devuelve. Bloquea en orden estable. */
export async function ajustarExistenciasTaller(tx: Prisma.TransactionClient, cambios: Map<string, Prisma.Decimal>) {
  const ids = [...cambios.keys()].map(BigInt).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  if (!ids.length) return;
  const filas = await tx.$queryRaw<{ id: bigint; existencia: number }[]>(Prisma.sql`
    SELECT id, existencia FROM taller_refacciones
    WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE
  `);
  if (filas.length !== ids.length) throw new ErrorStockTaller("Una refacción ya no existe en esta organización");
  const porId = new Map(filas.map((f) => [String(f.id), f.existencia]));
  for (const id of ids) {
    const existencia = porId.get(String(id))!;
    const siguiente = new Prisma.Decimal(existencia).minus(cambios.get(String(id))!);
    if (siguiente.lessThan(0) || !siguiente.isInteger()) throw new ErrorStockTaller("Existencia insuficiente para agregar esa refacción");
    await tx.tallerRefaccion.update({ where: { id }, data: { existencia: siguiente.toNumber(), version: { increment: 1 } } });
  }
}
