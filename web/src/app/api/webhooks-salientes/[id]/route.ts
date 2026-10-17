import { db } from "@/lib/db";
import { conAdminIntegracion, idIntegracion, leerObjeto, respuestaIntegracion } from "@/lib/integraciones-api";
import { editarWebhookSaliente } from "@/lib/services/webhooks-salientes";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
export const PATCH = conAdminIntegracion(async (req, _orgId, props: Props) => {
  return respuestaIntegracion(await editarWebhookSaliente(idIntegracion((await props.params).id), await leerObjeto(req)));
});
export const DELETE = conAdminIntegracion(async (_req, _orgId, props: Props) => {
  const resultado = await db.webhookSaliente.deleteMany({ where: { id: idIntegracion((await props.params).id) } });
  return respuestaIntegracion(resultado.count ? { ok: true } : { error: "registro inexistente" }, resultado.count ? 200 : 404);
});
