import { NextRequest, NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import { borrarDispositivo, tokenFcmValido } from "@/lib/dispositivos-push";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const body = await req.json().catch(() => null);
  if (body?.tokenFcm !== undefined) {
    if (!tokenFcmValido(body.tokenFcm)) return NextResponse.json({ error: "dispositivo inválido" }, { status: 400 });
    await borrarDispositivo(sesion.userId!, body.tokenFcm);
  }
  return NextResponse.json({ ok: true });
}
