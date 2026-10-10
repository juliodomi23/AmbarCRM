import { NextResponse } from "next/server";
import { puedeAutorizarDescuento } from "@/lib/caja";
import { construirCatalogoCaja } from "@/lib/caja-catalogo-db";
import { conModulo } from "@/lib/con-modulo";

export const dynamic = "force-dynamic";

/** Catálogo para la caja sin internet. Apagado por empresa (`ventasSinRed`): sin el modo no se entrega. */
export const GET = conModulo("caja", {}, async (sesion) => {
  if (sesion.userId === null || sesion.orgId === null) return NextResponse.json({ error: "Sesión incompleta" }, { status: 400 });
  const catalogo = await construirCatalogoCaja(sesion.orgId);
  if (!catalogo.ventasSinRed) return NextResponse.json({ error: "El modo sin internet no está activo", codigo: "SIN_RED_APAGADO" }, { status: 403 });
  return NextResponse.json({
    identidad: { orgId: String(sesion.orgId), userId: String(sesion.userId) },
    sinTopeDescuento: puedeAutorizarDescuento(sesion.rol, sesion.puesto),
    catalogo,
  });
});
