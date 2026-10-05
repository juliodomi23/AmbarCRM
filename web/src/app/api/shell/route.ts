import { NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import { obtenerContadoresShell } from "@/lib/services/shell";

export const dynamic = "force-dynamic";

export async function GET() {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  return NextResponse.json(await obtenerContadoresShell(sesion.userId));
}
