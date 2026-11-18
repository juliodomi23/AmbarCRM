/** Tipos del módulo Meta Ads (Fase 2: solo lectura, ads_read). */

export type EstadoConexionMeta =
  | "activa"
  | "requiere_reconectar"
  | "revocada";

export type MetaAdsConexionDto = {
  id: string;
  adAccountId: string;
  estado: EstadoConexionMeta;
  ultimoError: string | null;
  sincronizadoAt: string | null;
  createdAt: string;
};

/** Fila de meta_ads_insights lista para persistir/mostrar. */
export type InsightDia = {
  adId: string;
  nombreAnuncio: string;
  fecha: string; // YYYY-MM-DD
  spend: number;
  ctr: number;
  cpa: number;
  impresiones: number;
  /** Personas distintas alcanzadas (Meta `reach`). */
  reach: number;
  /** Costo por 1,000 impresiones. */
  cpm: number;
};

export type DiaSemanaInsight = {
  /** 0 = domingo ... 6 = sábado (mismo criterio que Meta). */
  dia: number;
  spend: number;
  impresiones: number;
  resultados: number;
};

export type RangoInsights = {
  desde: string; // YYYY-MM-DD (inclusive)
  hasta: string; // YYYY-MM-DD (inclusive)
};

export type ResumenDashboard = {
  mesGasto: number;
  impresionesMes: number;
  cpaPromedio: number | null;
  ctrPromedio: number | null;
  rankingMejor: (InsightDia & { id: string }) | null;
  rankingPeor: (InsightDia & { id: string }) | null;
};

/** Respuesta cruda de Meta Graph Marketing API nivel=ad. */
export type RespuestaMetaInsight = {
  data?: Array<{
    ad_id?: string;
    ad_name?: string;
    date_start?: string;
    date_stop?: string;
    spend?: string;
    impressions?: string;
    ctr?: string;
    cpm?: string;
    cost_per_action_type?: Array<{ action_type?: string; value?: string }>;
    actions?: Array<{ action_type?: string; value?: string }>;
  }>;
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
  error?: { message?: string; type?: string; code?: number };
};
