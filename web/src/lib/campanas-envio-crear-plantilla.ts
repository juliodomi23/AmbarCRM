import { db } from "@/lib/db";
import { crearPlantillaMeta } from "@/lib/meta/crearPlantilla";
import { variablesDePlantilla } from "@/lib/meta/plantillaMeta";

export async function crearPlantillaParaCampana(id: bigint, body: Record<string, unknown>) {
  const campana = await db.campanaEnvio.findFirst({ where: { id, estado: "borrador" }, include: { canal: true } });
  if (!campana) return { status: 404, error: "Campaña en borrador inexistente" };
  if (!campana.canal.activo || campana.canal.estado !== "conectado" || campana.canal.proveedor !== "cloud_api")
    return { status: 400, error: "Canal de Meta desconectado" };
  const cantidad = variablesDePlantilla(String(body.body ?? "")).length;
  if (cantidad !== (Array.isArray(campana.mapeoVariables) ? campana.mapeoVariables.length : 0))
    return { status: 400, error: "El número de variables no coincide con el mapeo del archivo" };
  const resultado = await crearPlantillaMeta(campana.canal.config, { name: body.name, language: body.language, body: body.body, ejemplos: body.ejemplos, category: "MARKETING", botones: [] });
  if (!resultado.plantilla) return resultado;
  if (!["PENDING", "IN_APPEAL", "APPROVED"].includes(resultado.plantilla.status))
    return { status: 502, error: "Meta no dejó la plantilla en revisión" };
  await db.campanaEnvio.update({ where: { id }, data: { plantillaNombre: resultado.plantilla.name, plantillaIdioma: resultado.plantilla.language, plantillaEstado: resultado.plantilla.status, plantillaConsultadaAt: new Date() } });
  return resultado;
}
