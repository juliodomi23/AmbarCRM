import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { conciliarPendientes } from "@/lib/pagos/servicio";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const noAutorizado = requireApiKey(req);
  if (noAutorizado) return noAutorizado;
  return NextResponse.json({ ok: true, ...(await conciliarPendientes()) });
}
