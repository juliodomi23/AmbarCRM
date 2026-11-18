/**
 * Veredictos por anuncio. Puerto de la lógica probada en
 * docs/08-productos-internos/agente-meta-ads/n8n/bots/logica.js
 * (funciones summarize/analyzeCampaigns), adaptada a los datos que el
 * dashboard ya agrega por anuncio (últimos ~3 meses).
 *
 * Nada de esto ejecuta acciones en Meta: solo clasifica para mostrar al dueño.
 */

export type ReglasVeredicto = {
  /** Costo por resultado por encima de esto se considera "caro" (configurable por org). */
  maxCostPerResult: number;
  /** Gasto mínimo en el rango corto para opinar si sale caro o no. */
  minSpendToJudge: number;
  /** Meta de costo por resultado (configurable por org, para detectar "estrella"). */
  targetCostPerResult: number;
  /** Caída de CTR respecto al portafolio que se considera fatiga. */
  ctrDropPct: number;
  /** Resultados mínimos en el rango largo para sugerir revivir un pausado. */
  minResultsToRevive: number;
};

export const REGLAS_VEREDICTO: ReglasVeredicto = {
  maxCostPerResult: 60,
  minSpendToJudge: 150,
  targetCostPerResult: 30,
  ctrDropPct: 30,
  minResultsToRevive: 10,
};

/**
 * Combina los umbrales que el dueño configuró (MXN por resultado) con los
 * valores por defecto del módulo. Los detalles técnicos (gasto mínimo, caída
 * de CTR, resultados para revivir) se quedan siempre en su default.
 *
 * Sirve igual en cliente y servidor: no toca base de datos.
 */
export function reglasDeOrganizacion(
  cpaMaximo: number | null | undefined,
  cpaObjetivo: number | null | undefined,
): ReglasVeredicto {
  const maximo = typeof cpaMaximo === "number" && Number.isFinite(cpaMaximo) && cpaMaximo > 0 ? cpaMaximo : null;
  const objetivo = typeof cpaObjetivo === "number" && Number.isFinite(cpaObjetivo) && cpaObjetivo > 0 ? cpaObjetivo : null;
  return {
    ...REGLAS_VEREDICTO,
    ...(maximo !== null ? { maxCostPerResult: maximo } : {}),
    ...(objetivo !== null ? { targetCostPerResult: objetivo } : {}),
  };
}

export type TipoVeredicto = "cara" | "fatiga" | "estrella" | "revivir" | "normal";

export type VeredictoAnuncio = {
  /** Texto plano, sin emojis, listo para mostrar en un Badge. */
  texto: string;
  tipo: TipoVeredicto;
  /** Tono del Badge existente del sistema de UI. */
  tono: "destructive" | "warning" | "success" | "neutral";
};

export type DatosVeredicto = {
  gasto: number;           // MXN en el rango
  impresiones: number;
  ctr: number;             // porcentaje (0-100)
  ctrPortafolio?: number;  // CTR promedio del portafolio, para comparar fatiga
  cpa: number;             // MXN por resultado, 0 si no hay
  activo: boolean;         // tuvo datos en los últimos días del rango
  resultados: number;      // aproximación: gasto/cpa si cpa>0
  fechaUltimoDato?: string;
};

/**
 * Clasifica un anuncio. Prioridad: cara > fatiga > estrella > revivir > normal.
 */
export function veredictoDeAnuncio(d: DatosVeredicto, reglas = REGLAS_VEREDICTO): VeredictoAnuncio {
  const resultados = d.resultados > 0 ? d.resultados : d.cpa > 0 ? d.gasto / d.cpa : 0;
  const costPerResult = resultados > 0 ? d.gasto / resultados : null;

  // 1. Cara: gasta suficiente para juzgar y cada resultado sale caro.
  if (d.activo && d.gasto >= reglas.minSpendToJudge && costPerResult !== null && costPerResult > reglas.maxCostPerResult) {
    return { texto: "Caro", tipo: "cara", tono: "destructive" };
  }

  // 2. Fatiga: CTR por debajo del portafolio con suficiente alcance.
  //    (ctrPortafolio se pasa fuera; si no se conoce, se omite esta bandera.)
  if (d.activo && d.impresiones >= 1000 && (d.ctrPortafolio ?? 0) > 0 &&
      d.ctr < (d.ctrPortafolio ?? 0) * (1 - reglas.ctrDropPct / 100)) {
    return { texto: "Anuncio cansado", tipo: "fatiga", tono: "warning" };
  }

  // 3. Estrella: muy barato vs. la meta.
  if (d.activo && costPerResult !== null && costPerResult > 0 &&
      costPerResult <= reglas.targetCostPerResult * 0.7) {
    return { texto: "Funciona bien", tipo: "estrella", tono: "success" };
  }

  // 4. Revivir: pausado pero rentable en el rango largo.
  //    (Se detecta cuando no hubo datos recientes pero sí resultados previos baratos.)
  if (!d.activo && d.resultados >= reglas.minResultsToRevive && costPerResult !== null &&
      costPerResult <= reglas.targetCostPerResult) {
    return { texto: "Para volver a encender", tipo: "revivir", tono: "warning" };
  }

  return { texto: "Va normal", tipo: "normal", tono: "neutral" };
}

/** CTR promedio del portafolio (anuncios con impresiones), para comparar fatiga. */
export function ctrPortafolio(anuncios: DatosVeredicto[]): number {
  const conImpresiones = anuncios.filter((a) => a.impresiones > 0);
  if (conImpresiones.length === 0) return 0;
  return conImpresiones.reduce((s, a) => s + a.ctr, 0) / conImpresiones.length;
}
