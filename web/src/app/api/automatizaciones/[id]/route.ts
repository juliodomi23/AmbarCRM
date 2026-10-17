import { db } from "@/lib/db";
import { conAdminIntegracion, idIntegracion, leerObjeto, respuestaIntegracion } from "@/lib/integraciones-api";
import { guardarRegla } from "@/lib/services/reglas-automatizacion";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
export const PATCH = conAdminIntegracion(async (req, orgId, props: Props) => respuestaIntegracion(await guardarRegla(orgId, await leerObjeto(req), idIntegracion((await props.params).id))));
export const DELETE = conAdminIntegracion(async (_req, _orgId, props: Props) => {
  const resultado = await db.reglaAutomatizacion.deleteMany({ where: { id: idIntegracion((await props.params).id) } });
  return respuestaIntegracion(resultado.count ? { ok: true } : { error: "registro inexistente" }, resultado.count ? 200 : 404);
});
