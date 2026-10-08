import { Prisma } from "@prisma/client";
import { dbRaw } from "@/lib/db";

export class ErrorRetail extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function transaccionTenant<T>(
  orgId: bigint,
  operacion: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return dbRaw.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org', ${String(orgId)}, true)`;
    return operacion(tx);
  });
}

export async function bloquearProductos(
  tx: Prisma.TransactionClient,
  productoIds: bigint[],
) {
  const ids = [...new Set(productoIds.map(String))]
    .map(BigInt)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (ids.length === 0) return;
  await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
    SELECT id
    FROM productos
    WHERE id IN (${Prisma.join(ids)})
    ORDER BY id
    FOR UPDATE
  `);
}

export async function bloquearVenta(tx: Prisma.TransactionClient, ventaId: bigint) {
  await tx.$queryRaw<Array<{ id: bigint }>>`
    SELECT id
    FROM ventas
    WHERE id = ${ventaId}
    FOR UPDATE
  `;
}

export async function bloquearCompra(tx: Prisma.TransactionClient, compraId: bigint) {
  await tx.$queryRaw<Array<{ id: bigint }>>`
    SELECT id
    FROM compras
    WHERE id = ${compraId}
    FOR UPDATE
  `;
}
