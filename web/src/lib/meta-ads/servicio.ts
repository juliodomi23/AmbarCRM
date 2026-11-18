import { transaccionTenant } from "@/lib/retail-db";
import { tokenMetaAds, revocarTokenMetaAds } from "./oauth";
import { ACCIONES_RESULTADO, esAccionResultado, type AccionResultado } from "./resultados";
import type { DiaSemanaInsight, EstadoAnuncio, InsightDia } from "./tipos";

type ConexionMeta = {
  id: bigint;
  adAccountId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  tokenExpiraAt: Date | null;
  accionResultado: AccionResultado | null;
  /** Umbral de "caro" en MXN por resultado. NULL = default del módulo. */
  cpaMaximo: number | null;
  /** Umbral de "resultado barato" en MXN. NULL = default del módulo. */
  cpaObjetivo: number | null;
};

/** Convierte un valor crudo de Postgres a número positivo, o NULL si no sirve. */
function numeroPositivo(valor: string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

/** Error de permisos de Meta (la conexión se autorizó sin `ads_management`). */
export class ErrorPermisoMetaAds extends Error {
  constructor() {
    super("Tu cuenta no tiene permiso para pausar/reanudar — reconéctala para darle acceso.");
    this.name = "ErrorPermisoMetaAds";
  }
}

/** Se queda solo con los dos estados que el panel puede alternar. */
function normalizarEstadoAnuncio(status?: string, effectiveStatus?: string): EstadoAnuncio | null {
  const estado = (status || effectiveStatus || "").toUpperCase();
  if (estado === "ACTIVE") return "ACTIVE";
  if (estado === "PAUSED" || estado === "ADSET_PAUSED" || estado === "CAMPAIGN_PAUSED") return "PAUSED";
  return null;
}

export async function obtenerConexionPorOrg(orgId: bigint, clienteId: bigint): Promise<ConexionMeta | null> {
  return transaccionTenant(orgId, async (tx) => {
    const conexion = await tx.metaAdsConexion.findFirst({
      where: { orgId, clienteId, estado: "activa" },
    });
    if (!conexion) return null;
    // Se lee con to_jsonb para que una BD todavía sin la migración no rompa la consulta:
    // si la columna no existe, simplemente devuelve NULL y se usa el valor por defecto.
    const [config] = await tx.$queryRaw<Array<{
      accion_resultado: string | null;
      cpa_maximo: string | null;
      cpa_objetivo: string | null;
    }>>`
      SELECT
        to_jsonb(c)->>'accion_resultado' AS accion_resultado,
        to_jsonb(c)->>'cpa_maximo' AS cpa_maximo,
        to_jsonb(c)->>'cpa_objetivo' AS cpa_objetivo
      FROM meta_ads_conexiones c
      WHERE c.id = ${conexion.id}
    `;
    const accionResultado = esAccionResultado(config?.accion_resultado) ? config.accion_resultado : null;
    return {
      id: conexion.id,
      adAccountId: conexion.adAccountId,
      accessTokenEncrypted: conexion.accessTokenEncrypted,
      refreshTokenEncrypted: conexion.refreshTokenEncrypted ?? null,
      tokenExpiraAt: conexion.tokenExpiraAt ?? null,
      accionResultado,
      cpaMaximo: numeroPositivo(config?.cpa_maximo),
      cpaObjetivo: numeroPositivo(config?.cpa_objetivo),
    };
  });
}

/**
 * Métricas de resultado canónicas, en orden de prioridad por defecto.
 *
 * Meta reporta el mismo evento con varios nombres a la vez (por ejemplo
 * `onsite_conversion.messaging_conversation_started_7d` y
 * `onsite_conversion.total_messaging_connection` traen casi el mismo valor;
 * `lead`, `onsite_conversion.lead` y `onsite_conversion.lead_grouped` son el
 * mismo lead repetido). Por eso NO se suman: se elige una sola por fila.
 *
 * Prioridad por defecto:
 * 1. `onsite_conversion.messaging_conversation_started_7d`
 * 2. `purchase`
 * 3. `lead`
 * 4. Ninguna => 0
 *
 * Si la organización eligió una métrica en Configuración, se usa solo esa.
 */
const ACCIONES_RESULTADO_CANONICAS = ACCIONES_RESULTADO.map((opcion) => opcion.valor);

/**
 * Devuelve el valor de la única métrica de resultado de esa fila.
 * Nunca suma varias acciones: si no hay ninguna, devuelve 0.
 *
 * @param preferida Métrica elegida por la organización. Si viene, solo esa cuenta.
 *
 * Sirve tanto para `actions` (conteo de resultados) como para
 * `cost_per_action_type` (costo por resultado).
 */
function valorResultadoCanonico(
  acciones?: Array<{ action_type?: string; value?: string }>,
  preferida?: AccionResultado | null,
): number {
  if (!acciones || acciones.length === 0) return 0;
  const tipos = preferida ? [preferida] : ACCIONES_RESULTADO_CANONICAS;
  for (const tipo of tipos) {
    const accion = acciones.find((a) => a.action_type === tipo);
    if (accion) return Number(accion.value ?? 0);
  }
  return 0;
}

/**
 * Estado actual (ACTIVE/PAUSED) de cada anuncio de la cuenta.
 *
 * El edge `/insights` solo devuelve métricas: no acepta `status` ni
 * `effective_status` como campos. Por eso el estado se consulta aparte al edge
 * `/ads`, que es el dato real que decide si el botón dice Pausar o Reanudar.
 */
async function obtenerEstadosAnuncios(adAccountId: string, token: string): Promise<Map<string, EstadoAnuncio>> {
  const estados = new Map<string, EstadoAnuncio>();
  const url = new URL(`https://graph.facebook.com/v26.0/act_${adAccountId}/ads`);
  url.searchParams.set("fields", "id,status,effective_status");
  url.searchParams.set("limit", "100");

  let siguiente: string | null = url.toString();
  let paginas = 0;

  while (siguiente) {
    paginas++;
    if (paginas > 50) throw new Error("Meta devolvió demasiadas páginas de anuncios; se detuvo por seguridad");
    const response = await fetch(siguiente, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Meta respondió ${response.status} al consultar el estado de los anuncios`);
    const data = await response.json() as {
      data?: Array<{ id?: string; status?: string; effective_status?: string }>;
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (data.error) throw new Error(data.error.message || "Meta devolvió un error al consultar el estado de los anuncios");
    for (const anuncio of data.data ?? []) {
      if (!anuncio.id) continue;
      const estado = normalizarEstadoAnuncio(anuncio.status, anuncio.effective_status);
      if (estado) estados.set(anuncio.id, estado);
    }
    siguiente = data.paging?.next ?? null;
  }

  return estados;
}

/**
 * Ejecuta la sincronización de insights de Meta Ads para una conexión.
 * Llama a GET /act_<id>/insights con fields=spend,ctr,cpm,reach,actions&level=ad
 * para los últimos ~3 meses (time_increment=1) y hace upsert diario.
 * Meta paginatea los resultados; el loop sigue paging.next hasta agotar todas las páginas.
 *
 * Además hace dos llamadas extra:
 * - GET /act_<id>/ads (estado ACTIVE/PAUSED de cada anuncio, para Pausar/Reanudar).
 * - breakdowns=hourly_stats_aggregated_by_advertiser_time_zone (gasto/resultados por hora).
 *
 * El desglose por día de la semana NO se pide a Meta (day_of_week no es un
 * breakdown válido en esta versión de la API): se deriva de las filas diarias,
 * que ya traen fecha por anuncio.
 */
export async function sincronizarInsightsOrg(orgId: bigint, clienteId: bigint, adAccountId: string): Promise<{ creados: number; actualizados: number }> {
  const conexion = await obtenerConexionPorOrg(orgId, clienteId);
  if (!conexion) throw new Error("No hay conexión de Meta Ads activa para esta organización");
  const token = await tokenMetaAds(orgId, conexion);

  // Estado real de los anuncios. Si la cuenta no lo permite, el sync sigue:
  // el estado solo afecta al botón Pausar/Reanudar, no a los resultados.
  const estadosAnuncios = await obtenerEstadosAnuncios(adAccountId, token).catch(() => new Map<string, EstadoAnuncio>());

  // Fecha de corte: últimos 3 meses (~89 días) desde hoy (incluyendo hoy).
  const hoy = new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 89);
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  hasta.setHours(23, 59, 59, 999);
  const rango = JSON.stringify({ since: desde.toISOString().slice(0, 10), until: hasta.toISOString().slice(0, 10) });

  // ---------- 1. Insights diarios por anuncio (level=ad, time_increment=1) ----------
  const urlDaily = new URL(`https://graph.facebook.com/v26.0/act_${adAccountId}/insights`);
  urlDaily.searchParams.set("fields", "ad_id,ad_name,impressions,spend,ctr,cpm,reach,actions,cost_per_action_type");
  urlDaily.searchParams.set("level", "ad");
  urlDaily.searchParams.set("time_increment", "1");
  urlDaily.searchParams.set("time_range", rango);
  urlDaily.searchParams.set("limit", "100");

  type FilaInsight = {
    ad_id?: string;
    ad_name?: string;
    date_start?: string;
    date_stop?: string;
    spend?: string;
    impressions?: string;
    reach?: string;
    ctr?: string;
    cpm?: string;
    cost_per_action_type?: Array<{ action_type?: string; value?: string }>;
    actions?: Array<{ action_type?: string; value?: string }>;
  };

  const filas: FilaInsight[] = [];
  let siguiente: string | null = urlDaily.toString();
  let paginas = 0;

  while (siguiente) {
    paginas++;
    if (paginas > 50) throw new Error("Meta devolvió demasiadas páginas de insights; se detuvo por seguridad");
    const response = await fetch(siguiente, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Meta respondió ${response.status} al consultar insights`);
    const data = await response.json() as {
      data?: FilaInsight[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (data.error) throw new Error(data.error.message || "Meta devolvió un error al consultar insights");
    if (Array.isArray(data.data)) filas.push(...data.data);
    siguiente = data.paging?.next ?? null;
  }

  // ---------- 2. Desglose horario (breakdowns=hourly_stats_aggregated_by_advertiser_time_zone) ----------
  // Incompatible con level=ad + time_increment=1 en la misma llamada => fetch separado.
  const urlHourly = new URL(`https://graph.facebook.com/v26.0/act_${adAccountId}/insights`);
  urlHourly.searchParams.set("fields", "spend,impressions,actions");
  urlHourly.searchParams.set("breakdowns", "hourly_stats_aggregated_by_advertiser_time_zone");
  urlHourly.searchParams.set("time_range", rango);
  urlHourly.searchParams.set("limit", "100");

  type FilaHora = {
    hourly_stats_aggregated_by_advertiser_time_zone?: string; // "0", "1", ... "23"
    spend?: string;
    impressions?: string;
    actions?: Array<{ action_type?: string; value?: string }>;
  };

  const filasHora: FilaHora[] = [];
  let siguienteHora: string | null = urlHourly.toString();
  let paginasHora = 0;

  while (siguienteHora) {
    paginasHora++;
    if (paginasHora > 50) throw new Error("Meta devolvió demasiadas páginas de insights horarios; se detuvo por seguridad");
    const response = await fetch(siguienteHora, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Meta respondió ${response.status} al consultar insights horarios`);
    const data = await response.json() as {
      data?: FilaHora[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (data.error) throw new Error(data.error.message || "Meta devolvió un error al consultar insights horarios");
    if (Array.isArray(data.data)) filasHora.push(...data.data);
    siguienteHora = data.paging?.next ?? null;
  }

  // ---------- 3. Upsert diario + reemplazo de desgloses ----------
  let creados = 0; let actualizados = 0;

  await transaccionTenant(orgId, async (tx) => {
    // 3a. Upsert insights diarios (SQL directo para no depender del cliente generado
    // cuando las columnas reach/cpm son nuevas). De paso se acumula el día de la semana.
    const diaMap = new Map<number, { spend: number; impresiones: number; resultados: number }>();
    for (let d = 0; d <= 6; d++) diaMap.set(d, { spend: 0, impresiones: 0, resultados: 0 });
    // Evita contar dos veces si Meta repitiera la misma fila anuncio+fecha.
    const diasVistos = new Set<string>();

    for (const fila of filas) {
      const adId = fila.ad_id ?? "";
      const nombreAnuncio = fila.ad_name ?? "";
      const fechaStr = fila.date_start ?? "";
      if (!adId || !fechaStr) continue;

      const fecha = new Date(`${fechaStr}T00:00:00Z`);
      if (isNaN(fecha.getTime())) continue;

      const spend = fila.spend ? Number(fila.spend) : 0;
      const impresiones = fila.impressions ? Number(fila.impressions) : 0;
      const reach = fila.reach ? Number(fila.reach) : 0;
      const ctr = fila.ctr ? Number(fila.ctr) : 0;
      const cpm = fila.cpm ? Number(fila.cpm) : (impresiones > 0 ? (spend / impresiones) * 1000 : 0);
      // Una sola métrica canónica por fila: si no hay resultados, es 0 (nunca se suman).
      const resultadosDia = valorResultadoCanonico(fila.actions, conexion.accionResultado);

      let cpa = 0;
      const costoCanonico = valorResultadoCanonico(fila.cost_per_action_type, conexion.accionResultado);
      if (costoCanonico > 0) cpa = costoCanonico;
      else if (spend > 0 && resultadosDia > 0) cpa = spend / resultadosDia;

      // Día de la semana derivado de la fecha del anuncio (0 = domingo ... 6 = sábado).
      // Se usa mediodía UTC para que el día no se corra por zona horaria.
      const dia = new Date(`${fechaStr}T12:00:00Z`).getUTCDay();
      const claveDia = `${adId}|${fechaStr}`;
      if (!isNaN(dia) && dia >= 0 && dia <= 6 && !diasVistos.has(claveDia)) {
        diasVistos.add(claveDia);
        const acumuladoDia = diaMap.get(dia) ?? { spend: 0, impresiones: 0, resultados: 0 };
        acumuladoDia.spend += spend;
        acumuladoDia.impresiones += impresiones;
        acumuladoDia.resultados += Math.round(resultadosDia);
        diaMap.set(dia, acumuladoDia);
      }

      await tx.$executeRaw`
        INSERT INTO meta_ads_insights
          (org_id, cliente_id, ad_id, nombre_anuncio, fecha, spend, ctr, cpa, impresiones, reach, cpm, estado_anuncio, created_at, updated_at)
        VALUES
          (${orgId}, ${clienteId}, ${adId}, ${nombreAnuncio}, ${fechaStr}::date, ${spend}, ${ctr}, ${cpa}, ${impresiones}, ${reach}, ${cpm}, ${estadosAnuncios.get(adId) ?? null}, now(), now())
        ON CONFLICT (org_id, cliente_id, ad_id, fecha) DO UPDATE SET
          nombre_anuncio = EXCLUDED.nombre_anuncio,
          spend = EXCLUDED.spend,
          ctr = EXCLUDED.ctr,
          cpa = EXCLUDED.cpa,
          impresiones = EXCLUDED.impresiones,
          reach = EXCLUDED.reach,
          cpm = EXCLUDED.cpm,
          estado_anuncio = COALESCE(EXCLUDED.estado_anuncio, meta_ads_insights.estado_anuncio),
          updated_at = now()
      `;
      creados++;
    }

    // 3a-bis. El estado es del anuncio, no del día: se replica a todas sus filas
    // para que el dashboard lo lea aunque el anuncio lleve días sin entregar.
    for (const [adId, estado] of estadosAnuncios) {
      await tx.$executeRaw`
        UPDATE meta_ads_insights
        SET estado_anuncio = ${estado}
        WHERE org_id = ${orgId} AND cliente_id = ${clienteId} AND ad_id = ${adId}
      `;
    }

    // 3b. Reemplazar snapshots horarios (24 filas por org)
    await tx.$executeRaw`DELETE FROM meta_ads_horarios WHERE org_id = ${orgId} AND cliente_id = ${clienteId}`;

    const horaMap = new Map<number, { spend: number; impresiones: number; resultados: number }>();
    for (let h = 0; h <= 23; h++) horaMap.set(h, { spend: 0, impresiones: 0, resultados: 0 });

    for (const f of filasHora) {
      const horaStr = f.hourly_stats_aggregated_by_advertiser_time_zone;
      if (horaStr === undefined || horaStr === null) continue;
      const hora = parseInt(horaStr, 10);
      if (isNaN(hora) || hora < 0 || hora > 23) continue;

      const spend = f.spend ? Number(f.spend) : 0;
      const impresiones = f.impressions ? Number(f.impressions) : 0;
      // Solo se usa una métrica por fila; no se suman nombres duplicados.
      const resultados = Math.round(valorResultadoCanonico(f.actions, conexion.accionResultado));

      const existing = horaMap.get(hora) ?? { spend: 0, impresiones: 0, resultados: 0 };
      existing.spend += spend;
      existing.impresiones += impresiones;
      existing.resultados += resultados;
      horaMap.set(hora, existing);
    }

    for (const [hora, datos] of horaMap.entries()) {
      await tx.$executeRaw`
        INSERT INTO meta_ads_horarios (org_id, cliente_id, hora, spend, impresiones, resultados, created_at, updated_at)
        VALUES (${orgId}, ${clienteId}, ${hora}, ${datos.spend}, ${datos.impresiones}, ${datos.resultados}, now(), now())
      `;
    }

    // 3c. Reemplazar snapshots por día de la semana (7 filas por org).
    // diaMap ya se llenó con las filas diarias; si Meta no trajo datos, quedan 7 filas en cero.
    await tx.$executeRaw`DELETE FROM meta_ads_dias_semana WHERE org_id = ${orgId} AND cliente_id = ${clienteId}`;

    for (const [dia, datos] of diaMap.entries()) {
      await tx.$executeRaw`
        INSERT INTO meta_ads_dias_semana (org_id, cliente_id, dia, spend, impresiones, resultados, created_at, updated_at)
        VALUES (${orgId}, ${clienteId}, ${dia}, ${datos.spend}, ${datos.impresiones}, ${datos.resultados}, now(), now())
      `;
    }

    await tx.metaAdsConexion.update({ where: { id: conexion.id, orgId, clienteId }, data: { sincronizadoAt: new Date(), sincronizandoAt: null } });
  }, { timeout: 120_000, maxWait: 10_000 });

  return { creados, actualizados };
}

/**
 * Obtiene los insights de Meta Ads para HOY, en tiempo real (solo lectura).
 *
 * Es el backing del selector de período "Hoy" del dashboard: consulta la API de
 * Meta directamente (igual que el paso 1 de `sincronizarInsightsOrg`, mismo
 * `fields`, mismo `level=ad`, mismo `time_increment=1` y paginación) pero con
 * `time_range` = solo el día de hoy. NO escribe nada en `meta_ads_insights` ni
 * en ningún snapshot: es puramente de lectura y devuelve los insights canónicos
 * calculados sobre la respuesta de Meta.
 */
export async function obtenerInsightsHoy(orgId: bigint, clienteId: bigint, adAccountId: string): Promise<InsightDia[]> {
  const conexion = await obtenerConexionPorOrg(orgId, clienteId);
  if (!conexion) return [];

  const token = await tokenMetaAds(orgId, conexion);

  // Estado real de los anuncios (para Pausar/Reanudar); si no hay permiso, se ignora.
  const estadosAnuncios = await obtenerEstadosAnuncios(adAccountId, token).catch(() => new Map<string, EstadoAnuncio>());

  // Solo el día de hoy (zona horaria del servidor, igual que el sync).
  const hoy = new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  hasta.setHours(23, 59, 59, 999);
  const rango = JSON.stringify({ since: desde.toISOString().slice(0, 10), until: hasta.toISOString().slice(0, 10) });

  const urlDaily = new URL(`https://graph.facebook.com/v26.0/act_${adAccountId}/insights`);
  urlDaily.searchParams.set("fields", "ad_id,ad_name,impressions,spend,ctr,cpm,reach,actions,cost_per_action_type");
  urlDaily.searchParams.set("level", "ad");
  urlDaily.searchParams.set("time_increment", "1");
  urlDaily.searchParams.set("time_range", rango);
  urlDaily.searchParams.set("limit", "100");

  type FilaInsight = {
    ad_id?: string;
    ad_name?: string;
    date_start?: string;
    date_stop?: string;
    spend?: string;
    impressions?: string;
    reach?: string;
    ctr?: string;
    cpm?: string;
    cost_per_action_type?: Array<{ action_type?: string; value?: string }>;
    actions?: Array<{ action_type?: string; value?: string }>;
  };

  const filas: FilaInsight[] = [];
  let siguiente: string | null = urlDaily.toString();
  let paginas = 0;

  while (siguiente) {
    paginas++;
    if (paginas > 50) throw new Error("Meta devolvió demasiadas páginas de insights; se detuvo por seguridad");
    const response = await fetch(siguiente, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Meta respondió ${response.status} al consultar insights`);
    const data = await response.json() as {
      data?: FilaInsight[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (data.error) throw new Error(data.error.message || "Meta devolvió un error al consultar insights");
    if (Array.isArray(data.data)) filas.push(...data.data);
    siguiente = data.paging?.next ?? null;
  }

  const insights: InsightDia[] = [];
  for (const fila of filas) {
    const adId = fila.ad_id ?? "";
    const nombreAnuncio = fila.ad_name ?? "";
    const fechaStr = fila.date_start ?? "";
    if (!adId || !fechaStr) continue;

    const fecha = new Date(`${fechaStr}T00:00:00Z`);
    if (isNaN(fecha.getTime())) continue;

    const spend = fila.spend ? Number(fila.spend) : 0;
    const impresiones = fila.impressions ? Number(fila.impressions) : 0;
    const reach = fila.reach ? Number(fila.reach) : 0;
    const ctr = fila.ctr ? Number(fila.ctr) : 0;
    const cpm = fila.cpm ? Number(fila.cpm) : (impresiones > 0 ? (spend / impresiones) * 1000 : 0);
    // Una sola métrica canónica por fila: si no hay resultados, es 0 (nunca se suman).
    const resultadosDia = valorResultadoCanonico(fila.actions, conexion.accionResultado);

    let cpa = 0;
    const costoCanonico = valorResultadoCanonico(fila.cost_per_action_type, conexion.accionResultado);
    if (costoCanonico > 0) cpa = costoCanonico;
    else if (spend > 0 && resultadosDia > 0) cpa = spend / resultadosDia;

    insights.push({
      adId,
      nombreAnuncio,
      fecha: String(fechaStr).slice(0, 10),
      spend,
      ctr,
      cpa,
      impresiones,
      reach,
      cpm,
      estadoAnuncio: estadosAnuncios.get(adId) ?? null,
    });
  }

  return insights;
}

/**
 * Obtiene el desglose horario de Meta Ads para HOY, en tiempo real (solo lectura).
 *
 * Es el backing de la gráfica "Gasto por hora" del período "Hoy": consulta la API
 * de Meta con `breakdowns=hourly_stats_aggregated_by_advertiser_time_zone` y
 * `time_range` = solo hoy, sin escribir nada en BD. Si no hay conexión, retorna [].
 */
export async function obtenerHorariosHoy(orgId: bigint, clienteId: bigint, adAccountId: string): Promise<Array<{ hora: number; spend: number; impresiones: number }>> {
  const conexion = await obtenerConexionPorOrg(orgId, clienteId);
  if (!conexion) return [];

  const token = await tokenMetaAds(orgId, conexion);

  // Solo el día de hoy (zona horaria del servidor, igual que el sync).
  const hoy = new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  hasta.setHours(23, 59, 59, 999);
  const rango = JSON.stringify({ since: desde.toISOString().slice(0, 10), until: hasta.toISOString().slice(0, 10) });

  const url = new URL(`https://graph.facebook.com/v26.0/act_${adAccountId}/insights`);
  url.searchParams.set("fields", "spend,impressions");
  url.searchParams.set("breakdowns", "hourly_stats_aggregated_by_advertiser_time_zone");
  url.searchParams.set("time_range", rango);
  url.searchParams.set("limit", "100");

  type FilaHora = {
    hourly_stats_aggregated_by_advertiser_time_zone?: string;
    spend?: string;
    impressions?: string;
  };

  const filasHora: FilaHora[] = [];
  let siguiente: string | null = url.toString();
  let paginas = 0;

  while (siguiente) {
    paginas++;
    if (paginas > 50) throw new Error("Meta devolvió demasiadas páginas de insights horarios; se detuvo por seguridad");
    const response = await fetch(siguiente, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Meta respondió ${response.status} al consultar insights horarios`);
    const data = await response.json() as {
      data?: FilaHora[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (data.error) throw new Error(data.error.message || "Meta devolvió un error al consultar insights horarios");
    if (Array.isArray(data.data)) filasHora.push(...data.data);
    siguiente = data.paging?.next ?? null;
  }

  // Acumula por hora y rellena las 24 horas (0-23), igual que el sync.
  const horaMap = new Map<number, { spend: number; impresiones: number }>();
  for (let h = 0; h <= 23; h++) horaMap.set(h, { spend: 0, impresiones: 0 });

  for (const f of filasHora) {
    const horaStr = f.hourly_stats_aggregated_by_advertiser_time_zone;
    if (horaStr === undefined || horaStr === null) continue;
    const hora = parseInt(horaStr, 10);
    if (isNaN(hora) || hora < 0 || hora > 23) continue;
    const existing = horaMap.get(hora) ?? { spend: 0, impresiones: 0 };
    existing.spend += f.spend ? Number(f.spend) : 0;
    existing.impresiones += f.impressions ? Number(f.impressions) : 0;
    horaMap.set(hora, existing);
  }

  return Array.from(horaMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([hora, datos]) => ({ hora, spend: datos.spend, impresiones: datos.impresiones }));
}

/** Obtiene todos los snapshots diarios de una organización (para el dashboard). */
export async function listarInsightsOrg(orgId: bigint, clienteId: bigint): Promise<Array<InsightDia & { id: string }>> {
  return transaccionTenant(orgId, async (tx) => {
    const filas = await tx.$queryRaw<Array<{
      id: bigint;
      ad_id: string;
      nombre_anuncio: string;
      fecha: string;
      spend: string;
      ctr: string;
      cpa: string;
      impresiones: number;
      reach: number | null;
      cpm: string | null;
      estado_anuncio: string | null;
    }>>`
      SELECT
        id,
        ad_id,
        nombre_anuncio,
        fecha::text AS fecha,
        spend,
        ctr,
        cpa,
        impresiones,
        COALESCE((to_jsonb(i)->>'reach')::int, 0) AS reach,
        COALESCE((to_jsonb(i)->>'cpm')::numeric, 0) AS cpm,
        to_jsonb(i)->>'estado_anuncio' AS estado_anuncio
      FROM meta_ads_insights i
      WHERE org_id = ${orgId} AND cliente_id = ${clienteId}
      ORDER BY fecha DESC, id DESC
    `;
    return filas.map((fila) => ({
      id: fila.id.toString(),
      adId: fila.ad_id,
      nombreAnuncio: fila.nombre_anuncio,
      fecha: String(fila.fecha).slice(0, 10),
      spend: Number(fila.spend),
      ctr: Number(fila.ctr),
      cpa: Number(fila.cpa),
      impresiones: fila.impresiones,
      reach: fila.reach ?? 0,
      cpm: Number(fila.cpm ?? 0),
      estadoAnuncio: fila.estado_anuncio === "ACTIVE" || fila.estado_anuncio === "PAUSED" ? fila.estado_anuncio : null,
    }));
  });
}

/** Obtiene snapshots diarios de una ad_account para un rango de fechas. */
export async function listarInsightsRango(orgId: bigint, clienteId: bigint, adId: string, desde: string, hasta: string): Promise<InsightDia[]> {
  const conexion = await obtenerConexionPorOrg(orgId, clienteId);
  if (!conexion) return [];
  return transaccionTenant(orgId, async (tx) => {
    const filas = await tx.$queryRaw<Array<{
      ad_id: string;
      nombre_anuncio: string;
      fecha: string;
      spend: string;
      ctr: string;
      cpa: string;
      impresiones: number;
      reach: number | null;
      cpm: string | null;
      estado_anuncio: string | null;
    }>>`
      SELECT
        ad_id,
        nombre_anuncio,
        fecha::text AS fecha,
        spend,
        ctr,
        cpa,
        impresiones,
        COALESCE((to_jsonb(i)->>'reach')::int, 0) AS reach,
        COALESCE((to_jsonb(i)->>'cpm')::numeric, 0) AS cpm,
        to_jsonb(i)->>'estado_anuncio' AS estado_anuncio
      FROM meta_ads_insights i
      WHERE org_id = ${orgId} AND cliente_id = ${clienteId}
        AND ad_id = ${adId}
        AND fecha >= ${desde}::date
        AND fecha <= ${hasta}::date
      ORDER BY fecha ASC
    `;
    return filas.map((fila) => ({
      adId: fila.ad_id,
      nombreAnuncio: fila.nombre_anuncio,
      fecha: String(fila.fecha).slice(0, 10),
      spend: Number(fila.spend),
      ctr: Number(fila.ctr),
      cpa: Number(fila.cpa),
      impresiones: fila.impresiones,
      reach: fila.reach ?? 0,
      cpm: Number(fila.cpm ?? 0),
      estadoAnuncio: fila.estado_anuncio === "ACTIVE" || fila.estado_anuncio === "PAUSED" ? fila.estado_anuncio : null,
    }));
  });
}

/** Obtiene snapshots horarios (0-23) para una organización. */
export async function listarHorariosOrg(orgId: bigint, clienteId: bigint): Promise<Array<{ hora: number; spend: number; impresiones: number; resultados: number }>> {
  const conexion = await obtenerConexionPorOrg(orgId, clienteId);
  if (!conexion) return [];
  try {
    return await transaccionTenant(orgId, async (tx) => {
      const raw = await tx.$queryRaw<
        Array<{ hora: number; spend: string; impresiones: number; resultados: number }>
      >`
        SELECT hora, spend, impresiones, resultados FROM meta_ads_horarios WHERE org_id = ${orgId} AND cliente_id = ${clienteId} ORDER BY hora ASC
      `;
      return raw.map((f) => ({
        hora: f.hora,
        spend: Number(f.spend),
        impresiones: f.impresiones,
        resultados: f.resultados,
      }));
    });
  } catch {
    // BD sin la migración aplicada: el dashboard muestra el estado vacío.
    return [];
  }
}

/** Obtiene snapshots por día de la semana (0 = domingo ... 6 = sábado). */
export async function listarDiasSemanaOrg(orgId: bigint, clienteId: bigint): Promise<DiaSemanaInsight[]> {
  const conexion = await obtenerConexionPorOrg(orgId, clienteId);
  if (!conexion) return [];
  try {
    return await transaccionTenant(orgId, async (tx) => {
      const raw = await tx.$queryRaw<
        Array<{ dia: number; spend: string; impresiones: number; resultados: number }>
      >`
        SELECT dia, spend, impresiones, resultados FROM meta_ads_dias_semana WHERE org_id = ${orgId} AND cliente_id = ${clienteId} ORDER BY dia ASC
      `;
      return raw.map((f) => ({
        dia: f.dia,
        spend: Number(f.spend),
        impresiones: f.impresiones,
        resultados: f.resultados,
      }));
    });
  } catch {
    // BD sin la migración aplicada: el dashboard muestra el estado vacío.
    return [];
  }
}

/** Guarda la métrica que la organización considera "resultado". */
export async function guardarAccionResultado(orgId: bigint, clienteId: bigint, accion: AccionResultado | null): Promise<void> {
  await transaccionTenant(orgId, async (tx) => {
    await tx.$executeRaw`
      UPDATE meta_ads_conexiones
      SET accion_resultado = ${accion}, updated_at = now()
      WHERE org_id = ${orgId} AND cliente_id = ${clienteId}
    `;
  });
}

/**
 * Guarda los umbrales con los que se clasifican los anuncios (MXN por resultado):
 * `cpaMaximo` = a partir de aquí es "caro"; `cpaObjetivo` = aquí sería "barato".
 */
export async function guardarUmbralesVeredicto(
  orgId: bigint,
  clienteId: bigint,
  umbrales: { cpaMaximo: number; cpaObjetivo: number },
): Promise<void> {
  await transaccionTenant(orgId, async (tx) => {
    await tx.$executeRaw`
      UPDATE meta_ads_conexiones
      SET cpa_maximo = ${umbrales.cpaMaximo},
          cpa_objetivo = ${umbrales.cpaObjetivo},
          updated_at = now()
      WHERE org_id = ${orgId} AND cliente_id = ${clienteId}
    `;
  });
}

/** Revoca y desactiva la conexión de Meta Ads de una organización. */
export async function desconectarMetaAds(orgId: bigint, clienteId: bigint): Promise<void> {
  await transaccionTenant(orgId, async (tx) => {
    const conexion = await tx.metaAdsConexion.findFirst({ where: { orgId, clienteId } });
    if (!conexion) return;
    try { await revocarTokenMetaAds(conexion.accessTokenEncrypted); } catch { /* local debe completarse aunque Meta falle */ }
    await tx.metaAdsConexion.update({ where: { id: conexion.id, orgId, clienteId }, data: { estado: "revocada", accessTokenEncrypted: "", refreshTokenEncrypted: null } });
  });
}

/** Acción que un usuario puede ejecutar sobre un anuncio existente. */
export type AccionAnuncio = "pausar" | "reanudar";

function esErrorDePermisoMetaAds(statusHttp: number, error?: { code?: number; type?: string; message?: string }): boolean {
  if (statusHttp === 403) return true;
  if (!error) return false;
  // 10 / 200 / 294 = permisos insuficientes; 190 = token inválido o expirado.
  if ([10, 200, 294, 190].includes(error.code ?? -1)) return true;
  if (error.type === "OAuthException") return true;
  return /permission|permiso|ads_management/i.test(error.message ?? "");
}

/**
 * Pausa o reanuda un anuncio REAL en Meta (POST /<adId> con status).
 * No crea anuncios ni toca presupuestos: solo cambia ACTIVE <-> PAUSED.
 *
 * Si Meta rechaza por permisos (conexión autorizada antes de pedir
 * `ads_management`), lanza ErrorPermisoMetaAds con el mensaje para reconectar.
 * Al terminar, el nuevo estado se refleja de inmediato en la BD local.
 */
export async function cambiarEstadoAnuncioMeta(orgId: bigint, clienteId: bigint, adId: string, estado: EstadoAnuncio): Promise<void> {
  const conexion = await obtenerConexionPorOrg(orgId, clienteId);
  if (!conexion) throw new Error("No hay conexión de Meta Ads activa para esta organización");
  const token = await tokenMetaAds(orgId, conexion);

  const response = await fetch(`https://graph.facebook.com/v26.0/${encodeURIComponent(adId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ status: estado }),
  });

  const data = await response.json().catch(() => ({})) as {
    success?: boolean;
    error?: { message?: string; type?: string; code?: number; error_subcode?: number };
  };

  if (!response.ok || data.error) {
    if (esErrorDePermisoMetaAds(response.status, data.error)) throw new ErrorPermisoMetaAds();
    throw new Error(data.error?.message || `Meta respondió ${response.status} al cambiar el anuncio`);
  }

  // Refleja el estado sin esperar al próximo sync. Si la BD todavía no tiene
  // estado_anuncio, el anuncio ya cambió en Meta: no se rompe la respuesta.
  try {
    await transaccionTenant(orgId, async (tx) => {
      await tx.$executeRaw`
        UPDATE meta_ads_insights
        SET estado_anuncio = ${estado}, updated_at = now()
        WHERE org_id = ${orgId} AND cliente_id = ${clienteId} AND ad_id = ${adId}
      `;
    });
  } catch (error) {
    console.error("Meta Ads: no se pudo guardar estado_anuncio", error);
  }
}

/** Bitácora de pausas/reanudados hechas por usuarios reales (solo se agrega). */
export async function registrarAccionAnuncio(
  orgId: bigint,
  clienteId: bigint,
  adId: string,
  usuarioId: bigint | null,
  accion: AccionAnuncio,
): Promise<void> {
  try {
    await transaccionTenant(orgId, async (tx) => {
      await tx.$executeRaw`
        INSERT INTO meta_ads_acciones (org_id, cliente_id, ad_id, usuario_id, accion, creado_at)
        VALUES (${orgId}, ${clienteId}, ${adId}, ${usuarioId}, ${accion}, now())
      `;
    });
  } catch (error) {
    // La acción ya se ejecutó en Meta; si falta la migración, se registra en el log
    // del servidor pero no se le reporta un error falso al usuario.
    console.error("Meta Ads: no se pudo registrar la acción en meta_ads_acciones", error);
  }
}

/** Creativo del anuncio, traído al vuelo para el modal (no se guarda en BD). */
export type CreativoAnuncio = {
  imageUrl: string | null;
  thumbnailUrl: string | null;
  videoId: string | null;
  body: string | null;
  title: string | null;
};

/**
 * Trae la vista previa del anuncio desde Meta al momento de abrir el modal.
 *
 * Se pide `creative{...}` (imagen, miniatura, id de video, texto y título)
 * en vez del edge `/previews`, que devuelve un <iframe> para embeber.
 * Si Meta no puede (anuncio borrado, sin permiso), devuelve null: el modal
 * muestra el resto de la info con un aviso, nunca rompe.
 */
export async function obtenerCreativoAnuncio(orgId: bigint, clienteId: bigint, adId: string): Promise<CreativoAnuncio | null> {
  try {
    const conexion = await obtenerConexionPorOrg(orgId, clienteId);
    if (!conexion) return null;
    const token = await tokenMetaAds(orgId, conexion);
    const url = new URL(`https://graph.facebook.com/v26.0/${encodeURIComponent(adId)}`);
    url.searchParams.set("fields", "creative{thumbnail_url,image_url,video_id,body,title,image_hash,object_story_spec{link_data{child_attachments{image_hash}}}}");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    const data = await response.json() as {
      creative?: { 
        thumbnail_url?: string; 
        image_url?: string; 
        video_id?: string; 
        body?: string; 
        title?: string; 
        image_hash?: string;
        object_story_spec?: { 
          link_data?: { 
            child_attachments?: { 
              image_hash?: string; 
            }[] 
          } 
        } 
      };
    };
    if (!data.creative) return null;
    const c = data.creative;

    // Busca image_hash: primero en carrusel (child_attachments), luego a nivel creativo
    const carruselHash = c.object_story_spec?.link_data?.child_attachments?.[0]?.image_hash;
    const hashDirecto = c.image_hash;
    const imageHash = carruselHash ?? hashDirecto;

    // Si hay image_hash, resuélvelo contra adimages (URL real de alta resolución)
    let resolvedImageUrl: string | null = null;
    if (imageHash) {
      try {
        const adImagesUrl = new URL(`https://graph.facebook.com/v26.0/act_${encodeURIComponent(conexion.adAccountId)}/adimages`);
        adImagesUrl.searchParams.set("hashes", JSON.stringify([imageHash]));
        adImagesUrl.searchParams.set("fields", "hash,url");
        const imgRes = await fetch(adImagesUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (imgRes.ok) {
          const imgData = await imgRes.json() as { data?: { hash: string; url: string }[] };
          resolvedImageUrl = imgData?.data?.[0]?.url ?? null;
        }
      } catch {
        // Si falla la resolución, seguimos con lo que tengamos
      }
    }

    // Para anuncios de video, el thumbnail_url que regresa el creativo es chiquito.
    // Se pide el edge /thumbnails del video y se usa el de mayor resolución.
    let resolvedVideoThumbnail: string | null = null;
    if (c.video_id) {
      try {
        const thumbsUrl = new URL(`https://graph.facebook.com/v26.0/${encodeURIComponent(c.video_id)}/thumbnails`);
        thumbsUrl.searchParams.set("fields", "uri,height,width");
        const thumbsRes = await fetch(thumbsUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (thumbsRes.ok) {
          const thumbsData = await thumbsRes.json() as { data?: { uri: string; height: number; width: number }[] };
          const candidates = thumbsData?.data ?? [];
          if (candidates.length > 0) {
            resolvedVideoThumbnail = candidates.reduce((best, current) =>
              (current.height * current.width) > (best.height * best.width) ? current : best,
            ).uri ?? null;
          }
        }
      } catch {
        // Si falla la resolución de thumbnails, seguimos sin romper nada
      }
    }

    const creativo: CreativoAnuncio = {
      imageUrl: resolvedImageUrl ?? resolvedVideoThumbnail ?? c.image_url ?? c.thumbnail_url ?? null,
      thumbnailUrl: c.thumbnail_url ?? null,
      videoId: c.video_id ?? null,
      body: c.body ?? null,
      title: c.title ?? null,
    };
    return creativo.imageUrl || creativo.thumbnailUrl || creativo.body || creativo.title ? creativo : null;
  } catch (error) {
    // El creativo es opcional: el modal siempre funciona sin él.
    console.error("Meta Ads: no se pudo traer el creativo del anuncio", error);
    return null;
  }
}

/** Acción de un usuario sobre un anuncio, con el nombre de quien la hizo. */
export type AccionAnuncioHistorial = {
  id: string;
  accion: AccionAnuncio;
  creadoAt: string;
  usuarioNombre: string | null;
};

/** Historial de pausas/reanudados de un anuncio (más reciente primero). */
export async function listarAccionesAnuncio(orgId: bigint, clienteId: bigint, adId: string): Promise<AccionAnuncioHistorial[]> {
  try {
    return await transaccionTenant(orgId, async (tx) => {
      const filas = await tx.$queryRaw<Array<{
        id: bigint;
        accion: string;
        creado_at: Date;
        usuario_nombre: string | null;
      }>>`
        SELECT a.id,
               a.accion::text AS accion,
               a.creado_at,
               u.nombre AS usuario_nombre
        FROM meta_ads_acciones a
        LEFT JOIN usuarios u ON u.id = a.usuario_id AND u.org_id = a.org_id
        WHERE a.org_id = ${orgId} AND a.cliente_id = ${clienteId} AND a.ad_id = ${adId}
        ORDER BY a.creado_at DESC
        LIMIT 20
      `;
      return filas.map((f) => ({
        id: f.id.toString(),
        accion: f.accion === "reanudar" ? "reanudar" : "pausar",
        creadoAt: new Date(f.creado_at).toISOString(),
        usuarioNombre: f.usuario_nombre,
      }));
    });
  } catch (error) {
    // Si falta la tabla (migración no aplicada), el modal igual abre sin historial.
    console.error("Meta Ads: no se pudo leer el historial de acciones", error);
    return [];
  }
}
