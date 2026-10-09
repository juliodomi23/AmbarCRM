import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { vencerApartados } from "@/lib/caja-a2-db";
import { dbRaw, runWithOrg } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const noAuth = requireApiKey(req);
  if (noAuth) return noAuth;
  const orgs = await dbRaw.$queryRawUnsafe<{ id: bigint }[]>(
    "SELECT id FROM orgs WHERE activo = true",
  );
  let vencidos = 0;
  const empresasConError: string[] = [];
  for (const org of orgs) {
    try {
      vencidos += await runWithOrg(org.id, () => vencerApartados({ orgId: org.id, userId: null }));
    } catch (error) {
      empresasConError.push(String(org.id));
      console.error(`[cron/vencer-apartados] org ${org.id}:`, error);
    }
  }
  return NextResponse.json({ ok: true, vencidos, empresasConError });
}
