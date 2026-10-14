import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { dbRaw, runWithOrg } from "@/lib/db";
import { generarCobros } from "@/lib/cobros-db";

export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const noAuth = requireApiKey(req);
  if (noAuth) return noAuth;
  const orgs = await dbRaw.org.findMany({ where: { activo: true }, select: { id: true } });
  let generados = 0;
  let vencidos = 0;
  const empresasConError: string[] = [];
  for (const org of orgs) {
    try {
      const resultado = await runWithOrg(org.id, () => generarCobros(org.id));
      generados += resultado.generados;
      vencidos += resultado.vencidos;
    } catch (error) {
      empresasConError.push(String(org.id));
      console.error(`[cron/generar-cobros] org ${org.id}:`, error);
    }
  }
  return Response.json({ ok: empresasConError.length === 0, generados, vencidos, empresasConError });
}
