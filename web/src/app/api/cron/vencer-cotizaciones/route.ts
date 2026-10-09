import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { vencerCotizaciones } from "@/lib/cotizaciones-db";
import { dbRaw, runWithOrg } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const noAuth = requireApiKey(req);
  if (noAuth) return noAuth;
  const orgs = await dbRaw.$queryRawUnsafe<{ id: bigint }[]>("SELECT id FROM orgs WHERE activo = true");
  let vencidas = 0;
  const empresasConError: string[] = [];
  for (const org of orgs) {
    try {
      vencidas += await runWithOrg(org.id, () => vencerCotizaciones(org.id));
    } catch (error) {
      empresasConError.push(String(org.id));
      console.error(`[cron/vencer-cotizaciones] org ${org.id}:`, error);
    }
  }
  return NextResponse.json({ ok: true, vencidas, empresasConError });
}
