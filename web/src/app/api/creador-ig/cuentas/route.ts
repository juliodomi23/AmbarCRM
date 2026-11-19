import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { listarCuentasInstagram } from "@/lib/creador-ig/servicio";

export const dynamic = "force-dynamic";

export const GET = conModulo("creador_ig", {}, async (sesion, req: Request) => {
  if (!sesion.userId) return NextResponse.json({ error: "Sesión sin usuario" }, { status: 400 });
  const cuentas = await listarCuentasInstagram(sesion.orgId!);
  return NextResponse.json({ cuentas });
});