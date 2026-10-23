import { NextRequest, NextResponse } from "next/server";
import { borrarDispositivo, registrarDispositivo, tokenFcmValido } from "@/lib/dispositivos-push";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const body = await req.json().catch(() => null);
  if (!tokenFcmValido(body?.tokenFcm) || !["ios", "android"].includes(body?.plataforma)) {
    return NextResponse.json({ error: "dispositivo inválido" }, { status: 400 });
  }
  await registrarDispositivo(sesion.orgId!, sesion.userId!, body.tokenFcm, body.plataforma);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const body = await req.json().catch(() => null);
  if (!tokenFcmValido(body?.tokenFcm)) {
    return NextResponse.json({ error: "dispositivo inválido" }, { status: 400 });
  }
  await borrarDispositivo(sesion.userId!, body.tokenFcm);
  return NextResponse.json({ ok: true });
}
