import { conAdminIntegracion, leerObjeto, respuestaIntegracion } from "@/lib/integraciones-api";
import { crearWebhookSaliente, listarWebhooks } from "@/lib/services/webhooks-salientes";
export const dynamic = "force-dynamic";
export const GET = conAdminIntegracion(async () => respuestaIntegracion(await listarWebhooks()));
export const POST = conAdminIntegracion(async (req, orgId) => respuestaIntegracion(await crearWebhookSaliente(orgId, await leerObjeto(req)), 201));
