import { NextRequest, NextResponse } from "next/server";
import { puedeGestionarTurnos } from "@/lib/caja";
import { resolverRechazo, resolverRevisionVenta } from "@/lib/caja-revision-db";
import { conModulo } from "@/lib/con-modulo";
import { aBigInt } from "@/lib/ids";

type Props = { params: Promise<{ id: string }> };

/**
 * Marca como revisada una venta sin internet (`?tipo=venta`, por defecto) o resuelve un rechazo de la cola
 * (`?tipo=rechazo`). No cambia dinero ni existencias: el ajuste se hace por las rutas normales.
 */
export const PATCH = conModulo("caja", {}, async (sesion, req: NextRequest, { params }: Props) => {
  const id = aBigInt((await params).id);
  if (sesion.orgId === null || sesion.userId === null || !puedeGestionarTurnos(sesion.rol, sesion.puesto) || id === null) {
    return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  }
  const tipo = req.nextUrl.searchParams.get("tipo") === "rechazo" ? "rechazo" : "venta";
  const resuelto = tipo === "rechazo"
    ? await resolverRechazo(sesion.orgId, id, sesion.userId)
    : await resolverRevisionVenta(sesion.orgId, id, sesion.userId);
  if (!resuelto) return NextResponse.json({ error: "Registro no encontrado o ya revisado" }, { status: 404 });
  return NextResponse.json({ ok: true });
});
