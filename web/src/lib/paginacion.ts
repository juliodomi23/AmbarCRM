import type { NextRequest } from "next/server";
import { aBigInt } from "@/lib/ids";

const LIMITE_PREDETERMINADO = 200;

export function paginacionListado(req: NextRequest) {
  const solicitado = Number(req.nextUrl.searchParams.get("limite"));
  const take = Number.isInteger(solicitado) && solicitado > 0
    ? Math.min(solicitado, LIMITE_PREDETERMINADO)
    : LIMITE_PREDETERMINADO;
  const cursor = aBigInt(req.nextUrl.searchParams.get("cursor"));
  return {
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

/** Paneles de módulos: se listan los registros más recientes; las métricas se calculan en la BD sobre todos. */
export const LIMITE_PANEL = 200;
