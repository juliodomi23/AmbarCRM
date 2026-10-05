import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { getAjustes } from "@/lib/services/config";

export const dynamic = "force-dynamic";

/**
 * Cierra conversaciones inactivas en TODOS los tenants. Para que n8n lo llame con un
 * Schedule Trigger. Header: x-api-key = WA_API_KEY.
 */
export async function POST(req: NextRequest) {
  const noAuth = requireApiKey(req);
  if (noAuth) return noAuth;

  const orgs = await dbRaw.$queryRawUnsafe<{ id: bigint }[]>("SELECT id FROM orgs WHERE activo = true");
  let cerradas = 0;

  for (const o of orgs) {
    cerradas += await runWithOrg(o.id, async () => {
      const ajustes = await getAjustes();
      if (!ajustes.autoResolverActivo) return 0;
      const limite = new Date(Date.now() - (ajustes.autoResolverHoras || 24) * 60 * 60 * 1000);
      const res = await db.conversacion.updateMany({
        where: { estado: { not: "cerrada" }, ultimoMensajeAt: { lt: limite } },
        data: { estado: "cerrada" }
      });
      return res.count;
    });
  }

  return NextResponse.json({ ok: true, cerradas });
}
