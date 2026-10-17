import { db } from "@/lib/db";
import { conAdminIntegracion, idIntegracion, respuestaIntegracion } from "@/lib/integraciones-api";
export const dynamic = "force-dynamic";
export const GET = conAdminIntegracion(async (_req, _orgId, props: { params: Promise<{ id: string }> }) => {
  const reglaId = idIntegracion((await props.params).id);
  if (!await db.reglaAutomatizacion.findUnique({ where: { id: reglaId }, select: { id: true } })) return respuestaIntegracion({ error: "registro inexistente" }, 404);
  return respuestaIntegracion(await db.ejecucionRegla.findMany({ where: { reglaId }, orderBy: { id: "desc" }, take: 50 }));
});
