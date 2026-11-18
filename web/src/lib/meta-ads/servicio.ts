import { transaccionTenant } from "@/lib/retail-db";
import { tokenMetaAds, revocarTokenMetaAds } from "./oauth";
import { ACCIONES_RESULTADO, esAccionResultado, type AccionResultado } from "./resultados";
import type { DiaSemanaInsight, InsightDia } from "./tipos";

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

export async function obtenerConexionPorOrg(orgId: bigint): Promise<ConexionMeta | null> {
  return transaccionTenant(orgId, async (tx) => {
    const conexion = await tx.metaAdsConexion.findFirst({
      where: { orgId, estado: "activa" },
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
 * Ejecuta la sincronización de insights de Meta Ads para una conexión.
 * Llama a GET /act_<id>/insights con fields=spend,ctr,cpm,reach,actions&level=ad
 * para los últimos ~3 meses (time_increment=1) y hace upsert diario.
 * Meta paginatea los resultados; el loop sigue paging.next hasta agotar todas las páginas.
 *
 * Además hace una llamada extra de desglose:
 * - breakdowns=hourly_stats_aggregated_by_advertiser_time_zone (gasto/resultados por hora).
 *
 * El desglose por día de la semana NO se pide a Meta (day_of_week no es un
 * breakdown válido en esta versión de la API): se deriva de las filas diarias,
 * que ya traen fecha por anuncio.
 */
export async function sincronizarInsightsOrg(orgId: bigint, adAccountId: string): Promise<{ creados: number; actualizados: number }> {
  const conexion = await obtenerConexionPorOrg(orgId);
  if (!conexion) throw new Error("No hay conexión de Meta Ads activa para esta organización");
  const token = await tokenMetaAds(orgId, conexion);

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
          (org_id, ad_id, nombre_anuncio, fecha, spend, ctr, cpa, impresiones, reach, cpm, created_at, updated_at)
        VALUES
          (${orgId}, ${adId}, ${nombreAnuncio}, ${fechaStr}::date, ${spend}, ${ctr}, ${cpa}, ${impresiones}, ${reach}, ${cpm}, now(), now())
        ON CONFLICT (org_id, ad_id, fecha) DO UPDATE SET
          nombre_anuncio = EXCLUDED.nombre_anuncio,
          spend = EXCLUDED.spend,
          ctr = EXCLUDED.ctr,
          cpa = EXCLUDED.cpa,
          impresiones = EXCLUDED.impresiones,
          reach = EXCLUDED.reach,
          cpm = EXCLUDED.cpm,
          updated_at = now()
      `;
      creados++;
    }

    // 3b. Reemplazar snapshots horarios (24 filas por org)
    await tx.$executeRaw`DELETE FROM meta_ads_horarios WHERE org_id = ${orgId}`;

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
        INSERT INTO meta_ads_horarios (org_id, hora, spend, impresiones, resultados, created_at, updated_at)
        VALUES (${orgId}, ${hora}, ${datos.spend}, ${datos.impresiones}, ${datos.resultados}, now(), now())
      `;
    }

    // 3c. Reemplazar snapshots por día de la semana (7 filas por org).
    // diaMap ya se llenó con las filas diarias; si Meta no trajo datos, quedan 7 filas en cero.
    await tx.$executeRaw`DELETE FROM meta_ads_dias_semana WHERE org_id = ${orgId}`;

    for (const [dia, datos] of diaMap.entries()) {
      await tx.$executeRaw`
        INSERT INTO meta_ads_dias_semana (org_id, dia, spend, impresiones, resultados, created_at, updated_at)
        VALUES (${orgId}, ${dia}, ${datos.spend}, ${datos.impresiones}, ${datos.resultados}, now(), now())
      `;
    }

    await tx.metaAdsConexion.update({ where: { id: conexion.id }, data: { sincronizadoAt: new Date(), sincronizandoAt: null } });
  }, { timeout: 120_000, maxWait: 10_000 });

  return { creados, actualizados };
}

/** Obtiene todos los snapshots diarios de una organización (para el dashboard). */
export async function listarInsightsOrg(orgId: bigint): Promise<Array<InsightDia & { id: string }>> {
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
        COALESCE((to_jsonb(i)->>'cpm')::numeric, 0) AS cpm
      FROM meta_ads_insights i
      WHERE org_id = ${orgId}
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
    }));
  });
}

/** Obtiene snapshots diarios de una ad_account para un rango de fechas. */
export async function listarInsightsRango(orgId: bigint, adId: string, desde: string, hasta: string): Promise<InsightDia[]> {
  const conexion = await obtenerConexionPorOrg(orgId);
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
        COALESCE((to_jsonb(i)->>'cpm')::numeric, 0) AS cpm
      FROM meta_ads_insights i
      WHERE org_id = ${orgId}
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
    }));
  });
}

/** Obtiene snapshots horarios (0-23) para una organización. */
export async function listarHorariosOrg(orgId: bigint): Promise<Array<{ hora: number; spend: number; impresiones: number; resultados: number }>> {
  const conexion = await obtenerConexionPorOrg(orgId);
  if (!conexion) return [];
  try {
    return await transaccionTenant(orgId, async (tx) => {
      const raw = await tx.$queryRaw<
        Array<{ hora: number; spend: string; impresiones: number; resultados: number }>
      >`
        SELECT hora, spend, impresiones, resultados FROM meta_ads_horarios WHERE org_id = ${orgId} ORDER BY hora ASC
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
export async function listarDiasSemanaOrg(orgId: bigint): Promise<DiaSemanaInsight[]> {
  const conexion = await obtenerConexionPorOrg(orgId);
  if (!conexion) return [];
  try {
    return await transaccionTenant(orgId, async (tx) => {
      const raw = await tx.$queryRaw<
        Array<{ dia: number; spend: string; impresiones: number; resultados: number }>
      >`
        SELECT dia, spend, impresiones, resultados FROM meta_ads_dias_semana WHERE org_id = ${orgId} ORDER BY dia ASC
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
export async function guardarAccionResultado(orgId: bigint, accion: AccionResultado | null): Promise<void> {
  await transaccionTenant(orgId, async (tx) => {
    await tx.$executeRaw`
      UPDATE meta_ads_conexiones
      SET accion_resultado = ${accion}, updated_at = now()
      WHERE org_id = ${orgId}
    `;
  });
}

/**
 * Guarda los umbrales con los que se clasifican los anuncios (MXN por resultado):
 * `cpaMaximo` = a partir de aquí es "caro"; `cpaObjetivo` = aquí sería "barato".
 */
export async function guardarUmbralesVeredicto(
  orgId: bigint,
  umbrales: { cpaMaximo: number; cpaObjetivo: number },
): Promise<void> {
  await transaccionTenant(orgId, async (tx) => {
    await tx.$executeRaw`
      UPDATE meta_ads_conexiones
      SET cpa_maximo = ${umbrales.cpaMaximo},
          cpa_objetivo = ${umbrales.cpaObjetivo},
          updated_at = now()
      WHERE org_id = ${orgId}
    `;
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
