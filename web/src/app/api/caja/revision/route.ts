import { NextResponse } from "next/server";
import { puedeGestionarTurnos } from "@/lib/caja";
import { panelRevisionSinRed } from "@/lib/caja-revision-db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** "Ventas por revisar": solo Encargado de tienda o Admin. */
export const GET = conModulo("caja", {}, async (sesion) => {
  if (sesion.orgId === null || !puedeGestionarTurnos(sesion.rol, sesion.puesto)) {
    return NextResponse.json({ error: "Revisión no encontrada" }, { status: 404 });
  }
  return NextResponse.json(serializar(await panelRevisionSinRed(sesion.orgId)));
});
