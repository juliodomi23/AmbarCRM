import { NextRequest, NextResponse } from "next/server";
import { dbRaw, runWithOrg } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { conteoRecordatorios, recordatoriosDeLaEmpresa } from "@/lib/recordatorios-envio";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const noAuth = requireApiKey(req);
  if (noAuth) return noAuth;
  const orgs = await dbRaw.$queryRawUnsafe<{ id: bigint }[]>(
    "SELECT id FROM orgs WHERE activo = true",
  );
  const conteo = conteoRecordatorios();
  const empresasConError: string[] = [];
  for (const org of orgs) {
    try {
      await runWithOrg(org.id, () => recordatoriosDeLaEmpresa(conteo));
    } catch (error) {
      // Un error en una empresa no detiene los recordatorios de las demás.
      empresasConError.push(String(org.id));
      console.error(`[cron/recordatorios-citas] org ${org.id}:`, error);
    }
  }
  return NextResponse.json({ ok: true, ...conteo, empresasConError });
}
