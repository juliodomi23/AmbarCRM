import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";

export const nuevoTokenCita = () => crypto.randomBytes(16).toString("hex");

/** Conserva el enlace existente también cuando dos procesos lo solicitan a la vez. */
export async function asegurarTokenCita(tx: Prisma.TransactionClient, id: bigint) {
  const [fila] = await tx.$queryRaw<{ token_gestion: string }[]>`
    UPDATE citas SET token_gestion = COALESCE(token_gestion, ${nuevoTokenCita()})
    WHERE id = ${id} RETURNING token_gestion`;
  return fila?.token_gestion ?? null;
}
