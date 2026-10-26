import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { sincronizarCalendario } from "@/lib/calendario/servicio";

export const POST = conModulo("calendario", {}, async (sesion) => {
  if (!sesion.orgId) return NextResponse.json({ error: "La sesión no tiene organización" }, { status: 400 });
  try { return NextResponse.json(await sincronizarCalendario(sesion.orgId, sesion.rol === "admin" ? undefined : sesion.userId ?? undefined)); }
  catch { return NextResponse.json({ error: "No se pudo sincronizar Google Calendar" }, { status: 502 }); }
});
