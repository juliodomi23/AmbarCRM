import { transaccionTenant } from "@/lib/retail-db";
import { tokenMetaAds, revocarTokenMetaAds } from "./oauth";
import type { InsightDia } from "./tipos";

type ConexionMeta = {
  id: bigint;
  adAccountId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  tokenExpiraAt: Date | null;
};

export async function obtenerConexionPorOrg(orgId: bigint): Promise<ConexionMeta | null> {
  return transaccionTenant(orgId, async (tx) => {
    const conexion = await tx.metaAdsConexion.findFirst({
      where: { orgId, estado: "activa" },
    });
    if (!conexion) return null;
    return { id: conexion.id, adAccountId: conexion.adAccountId, accessTokenEncrypted: conexion.accessTokenEncrypted, refreshTokenEncrypted: conexion.refreshTokenEncrypted ?? null, tokenExpiraAt: conexion.tokenExpiraAt ?? null };
  });
}

/**
 * Ejecuta la sincronización de insights de Meta Ads para una conexión.
 * Llama a GET /act_<id>/insights con fields=spend,ctr,cpm,actions&level=ad
 * para los últimos 30 días (time_increment=1) y hace upsert diario.
 */
export async function sincronizarInsightsOrg(orgId: bigint, adAccountId: string): Promise<{ creados: number; actualizados: number }> {
  const conexion = await obtenerConexionPorOrg(orgId);
  if (!conexion) throw new Error("No hay conexión de Meta Ads activa para esta organización");
  const token = await tokenMetaAds(orgId, conexion);

  // Fecha de corte: últimos 30 días desde hoy (incluyendo hoy).
  const hoy = new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 29);
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  hasta.setHours(23, 59, 59, 999);

  const url = new URL(`https://graph.facebook.com/v26.0/act_${adAccountId}/insights`);
  url.searchParams.set("fields", "spend,ctr,cpm,actions,cost_per_action_type");
  url.searchParams.set("level", "ad");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("time_range", JSON.stringify({ since: desde.toISOString().slice(0, 10), until: hasta.toISOString().slice(0, 10) }));

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Meta respondió ${response.status} al consultar insights`);
  const data = await response.json() as {
    data?: Array<{
      ad_id?: string;
      ad_name?: string;
      date_start?: string;
      date_stop?: string;
      spend?: string;
      impressions?: string;
      ctr?: string;
      cost_per_action_type?: Array<{ action_type?: string; value?: string }>;
      actions?: Array<{ action_type?: string; value?: string }>;
    }>;
    error?: { message?: string };
  };

  if (data.error) throw new Error(data.error.message || "Meta devolvió un error al consultar insights");
  const filas = data.data ?? [];

  let creados = 0; let actualizados = 0;

  await transaccionTenant(orgId, async (tx) => {
    for (const fila of filas) {
      const adId = fila.ad_id ?? "";
      const nombreAnuncio = fila.ad_name ?? "";
      const fechaStr = fila.date_start ?? "";
      if (!adId || !fechaStr) continue;

      const fecha = new Date(`${fechaStr}T00:00:00Z`);
      if (isNaN(fecha.getTime())) continue;

      const spend = fila.spend ? Number(fila.spend) : 0;
      const impresiones = fila.impressions ? Number(fila.impressions) : 0;
      const ctr = fila.ctr ? Number(fila.ctr) : 0;

      // CPA: costo por acción (purchase, lead, etc.). Si no hay acciones, 0.
      let cpa = 0;
      const acciones = fila.cost_per_action_type ?? [];
      const accionValida = acciones.find((a) => a.action_type === "purchase" || a.action_type === "lead");
      if (accionValida && accionValida.value) cpa = Number(accionValida.value);
      else if (spend > 0 && filas.length > 0) {
        const totalActions = (fila.actions ?? []).reduce((s, a) => s + Number(a.value ?? 0), 0);
        if (totalActions > 0) cpa = spend / totalActions;
      }

      const existente = await tx.metaAdsInsight.findFirst({ where: { orgId, adId, fecha: fechaStr } });
      if (existente) {
        await tx.metaAdsInsight.update({
          where: { id: existente.id },
          data: { nombreAnuncio, spend, ctr, cpa, impresiones, updatedAt: new Date() },
        });
        actualizados++;
      } else {
        await tx.metaAdsInsight.create({ data: { orgId, adId, nombreAnuncio, fecha: fechaStr, spend, ctr, cpa, impresiones } });
        creados++;
      }
    }

    await tx.metaAdsConexion.update({ where: { id: conexion.id }, data: { sincronizadoAt: new Date(), sincronizandoAt: null } });
  });

  return { creados, actualizados };
}

/** Obtiene snapshots diarios de una ad_account para un rango de fechas. */
export async function listarInsightsRango(orgId: bigint, adId: string, desde: string, hasta: string): Promise<InsightDia[]> {
  const conexion = await obtenerConexionPorOrg(orgId);
  if (!conexion) return [];
  return transaccionTenant(orgId, async (tx) => {
    const filas = await tx.metaAdsInsight.findMany({
      where: {
        orgId,
        adId,
        fecha: { gte: new Date(`${desde}T00:00:00Z`), lte: new Date(`${hasta}T23:59:59Z`) },
      },
      orderBy: [{ fecha: "asc" }],
    });
    return filas.map((fila) => ({
      adId: fila.adId,
      nombreAnuncio: fila.nombreAnuncio,
      fecha: fila.fecha.toISOString().slice(0, 10),
      spend: Number(fila.spend),
      ctr: Number(fila.ctr),
      cpa: Number(fila.cpa),
      impresiones: fila.impresiones,
    }));
  });
}

/** Revoca y desactiva la conexión de Meta Ads de una organización. */
export async function desconectarMetaAds(orgId: bigint): Promise<void> {
  await transaccionTenant(orgId, async (tx) => {
    const conexion = await tx.metaAdsConexion.findFirst({ where: { orgId } });
    if (!conexion) return;
    try { await revocarTokenMetaAds(conexion.accessTokenEncrypted); } catch { /* local debe completarse aunque Meta falle */ }
    await tx.metaAdsConexion.update({ where: { id: conexion.id }, data: { estado: "revocada", accessTokenEncrypted: "", refreshTokenEncrypted: null } });
  });
}