import { db } from "@/lib/db";
import { entregarEvento } from "@/lib/webhooks-salientes";
import { conAdminIntegracion, idIntegracion, respuestaIntegracion } from "@/lib/integraciones-api";
export const dynamic = "force-dynamic";
export const POST = conAdminIntegracion(async (_req, orgId, props: { params: Promise<{ id: string }> }) => {
  const id = idIntegracion((await props.params).id);
  const webhook = await db.webhookSaliente.findUnique({ where: { id }, select: { activo: true } });
  if (!webhook) return respuestaIntegracion({ error: "registro inexistente" }, 404);
  if (!webhook.activo) return respuestaIntegracion({ error: "activa el webhook antes de probar" }, 409);
  const [resultado] = await entregarEvento(orgId, "prueba", { id: String(id) }, {}, id);
  return respuestaIntegracion({ ok: resultado?.ok === true });
});
