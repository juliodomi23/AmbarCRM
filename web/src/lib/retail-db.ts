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
