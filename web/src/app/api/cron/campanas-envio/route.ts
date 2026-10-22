import { NextRequest } from "next/server";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { moduloHabilitado } from "@/lib/modulos";
import { procesarCampana } from "@/lib/campanas-envio-motor";
import { getAjustes } from "@/lib/services/config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const noAuth = requireApiKey(req);
  if (noAuth) return noAuth;
  const orgs = await dbRaw.$queryRaw<{ id: bigint }[]>`SELECT id FROM orgs WHERE activo = true`;
  const resultado = { enviados: 0, fallidos: 0, errores: [] as string[] };
  for (const org of orgs) {
    await runWithOrg(org.id, async () => {
      if (!(await moduloHabilitado("campanas_envio"))) return;
      if (!(await getAjustes()).campanasEnvioActivas) return;
      await db.campanaDestinatario.updateMany({ where: { estado: "enviando", updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { estado: "pendiente", enviadoAt: null } });
      const campanas = await db.campanaEnvio.findMany({ where: { estado: { in: ["programada", "en_curso"] } }, orderBy: { id: "asc" }, select: { id: true } });
      for (const campana of campanas) {
        try { const r = await procesarCampana(org.id, campana.id); resultado.enviados += r.enviados; resultado.fallidos += r.fallidos; if (r.error) resultado.errores.push(`Campaña ${campana.id}: ${r.error}`); }
        catch (e) { resultado.errores.push(`Campaña ${campana.id}: ${e instanceof Error ? e.message : "error"}`); }
      }
    });
  }
  return Response.json({ ok: resultado.errores.length === 0, ...resultado });
}
