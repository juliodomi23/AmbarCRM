import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { guardarEmisor, obtenerEmisor } from "@/lib/cfdi/servicio";
import { serializar } from "@/lib/serialize";

export const GET = conModulo("facturacion", {}, async () => {
  return NextResponse.json(serializar({ emisor: await obtenerEmisor() }));
});

async function guardar(sesion: { orgId: bigint | null }, req: NextRequest) {
  if (sesion.orgId === null) {
    return NextResponse.json({ error: "Organización no disponible" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const emisor = await guardarEmisor(sesion.orgId, body);
  return NextResponse.json(serializar({ emisor }), { status: 200 });
}

export const POST = conModulo("facturacion", { admin: true }, guardar);
export const PATCH = conModulo("facturacion", { admin: true }, guardar);
