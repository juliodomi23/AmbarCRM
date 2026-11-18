"use client";

import { useEffect, useState } from "react";
import { Badge, Boton, EncabezadoPagina } from "@/components/ui";
import { KpiCard } from "@/components/DashboardVisuals";
import { veredictoDeAnuncio, ctrPortafolio, reglasDeOrganizacion, REGLAS_VEREDICTO, type VeredictoAnuncio } from "@/lib/meta-ads/veredicto";
import { ACCIONES_RESULTADO, ACCION_RESULTADO_POR_DEFECTO } from "@/lib/meta-ads/resultados";

const VEREDICTO_TONO_MAP: Record<"cara" | "fatiga" | "estrella" | "revivir" | "normal", "destructive" | "warning" | "success" | "neutral"> = {
  cara: "destructive",
  fatiga: "warning",
  estrella: "success",
  revivir: "warning",
  normal: "neutral",
};

type InsightData = {
  id: string;
  adId: string;
  nombreAnuncio: string;
  fecha: string;
  spend: number;
  ctr: number;
  cpa: number;
  impresiones: number;
  reach: number;
  cpm: number;
  /** Estado real del anuncio en Meta (ACTIVE/PAUSED) al último sync. */
  estadoAnuncio?: "ACTIVE" | "PAUSED" | null;
};

type HorarioData = {
  hora: number;
  spend: number;
  impresiones: number;
  resultados: number;
};

type DiaSemanaData = {
  /** 0 = domingo ... 6 = sábado (mismo criterio que Meta). */
  dia: number;
  spend: number;
  impresiones: number;
  resultados: number;
};

type CuentaPublicitaria = {
  id: string;
  nombre: string;
  estado: number;
};

type ConexionData = {
  id: string;
  adAccountId: string;
  estado: string;
  sincronizadoAt?: string | null;
  ultimoError?: string | null;
  accionResultado?: string | null;
  cpaMaximo?: number | null;
  cpaObjetivo?: number | null;
} | null;

type RespuestaDashboard = { connection: ConexionData; insights: InsightData[] };

type Tab = "resumen" | "anuncios" | "horarios" | "configuracion";

type Periodo = "7d" | "30d" | "3m" | "personalizado";

type FiltroVeredicto = "todos" | "bien" | "normal" | "atencion";

const PERIODOS: Periodo[] = ["7d", "30d", "3m", "personalizado"];

const DIAS_PERIODO: Record<Exclude<Periodo, "personalizado">, number> = {
  "7d": 7,
  "30d": 30,
  "3m": 89,
};

const ETIQUETA_PERIODO: Record<Periodo, string> = {
  "7d": "7 días",
  "30d": "30 días",
  "3m": "3 meses",
  personalizado: "Personalizado",
};

const FILTROS_VEREDICTO: Array<{ id: FiltroVeredicto; etiqueta: string }> = [
  { id: "todos", etiqueta: "Todos" },
  { id: "bien", etiqueta: "Funcionan bien" },
  { id: "normal", etiqueta: "Van normal" },
  { id: "atencion", etiqueta: "Necesitan atención" },
];

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const NOMBRES_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const NOMBRES_DIA_MIN = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function dinero(valor: number) {
  return valor.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}

function isoLocal(fecha: Date) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function restarDias(iso: string, dias: number) {
  const [anio, mes, dia] = iso.split("-").map(Number);
  const fecha = new Date(anio, mes - 1, dia - dias, 12, 0, 0);
  return isoLocal(fecha);
}

function fechaCorta(iso: string) {
  const [, mes, dia] = iso.split("-").map(Number);
  return `${dia} ${MESES_CORTOS[mes - 1]}`;
}

function sumaPorFecha(insights: InsightData[]): Array<[string, number]> {
  const mapa = new Map<string, number>();
  for (const insight of insights) mapa.set(insight.fecha, (mapa.get(insight.fecha) ?? 0) + insight.spend);
  return [...mapa.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function serieDiariaImpresiones(insights: InsightData[]): Array<[string, number]> {
  const mapa = new Map<string, number>();
  for (const insight of insights) mapa.set(insight.fecha, (mapa.get(insight.fecha) ?? 0) + insight.impresiones);
  return [...mapa.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function serieDiariaReach(insights: InsightData[]): Array<[string, number]> {
  const mapa = new Map<string, number>();
  for (const insight of insights) mapa.set(insight.fecha, (mapa.get(insight.fecha) ?? 0) + insight.reach);
  return [...mapa.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function serieDiariaCtr(insights: InsightData[]): Array<[string, number]> {
  const acumulado = new Map<string, { suma: number; cuenta: number }>();
  for (const insight of insights) {
    const actual = acumulado.get(insight.fecha) ?? { suma: 0, cuenta: 0 };
    actual.suma += insight.ctr;
    actual.cuenta += 1;
    acumulado.set(insight.fecha, actual);
  }
  return [...acumulado.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([fecha, { suma, cuenta }]) => [fecha, suma / Math.max(1, cuenta)]);
}

function serieDiariaCpa(insights: InsightData[]): Array<[string, number]> {
  const acumulado = new Map<string, { suma: number; cuenta: number }>();
  for (const insight of insights) {
    if (insight.cpa <= 0) continue;
    const actual = acumulado.get(insight.fecha) ?? { suma: 0, cuenta: 0 };
    actual.suma += insight.cpa;
    actual.cuenta += 1;
    acumulado.set(insight.fecha, actual);
  }
  return [...acumulado.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([fecha, { suma, cuenta }]) => [fecha, suma / Math.max(1, cuenta)]);
}

function serieDiariaCpm(insights: InsightData[]): Array<[string, number]> {
  const acumulado = new Map<string, { spend: number; impresiones: number }>();
  for (const insight of insights) {
    const actual = acumulado.get(insight.fecha) ?? { spend: 0, impresiones: 0 };
    actual.spend += insight.spend;
    actual.impresiones += insight.impresiones;
    acumulado.set(insight.fecha, actual);
  }
  return [...acumulado.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([fecha, { spend, impresiones }]) => [fecha, impresiones > 0 ? (spend / impresiones) * 1000 : 0]);
}

function ultimosPuntos(serie: Array<[string, number]>, n = 14): number[] {
  return serie.slice(-n).map(([, valor]) => valor);
}

type BarraGasto = { clave: string; etiqueta: string; valor: number; detalle: string };

function agruparGasto(insights: InsightData[], periodo: Periodo): BarraGasto[] {
  if (periodo !== "3m") {
    return sumaPorFecha(insights).map(([fecha, valor]) => ({
      clave: fecha,
      etiqueta: fechaCorta(fecha),
      valor,
      detalle: fecha,
    }));
  }

  const fechas = [...new Set(insights.map((i) => i.fecha))].sort();
  if (fechas.length === 0) return [];
  const primera = new Date(`${fechas[0]}T00:00:00Z`);
  const mapa = new Map<number, { valor: number; inicio: string }>();

  for (const insight of insights) {
    const fecha = new Date(`${insight.fecha}T00:00:00Z`);
    const indice = Math.floor((fecha.getTime() - primera.getTime()) / (7 * 86400000));
    const actual = mapa.get(indice) ?? { valor: 0, inicio: insight.fecha };
    actual.valor += insight.spend;
    if (insight.fecha < actual.inicio) actual.inicio = insight.fecha;
    mapa.set(indice, actual);
  }

  return [...mapa.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, { valor, inicio }]) => {
      const fin = restarDias(inicio, -6);
      return {
        clave: inicio,
        etiqueta: `${fechaCorta(inicio)} – ${fechaCorta(fin)}`,
        valor,
        detalle: `Semana del ${inicio} al ${fin}`,
      };
    });
}

function etiquetaHora(hora: number) {
  const h12 = hora % 12 === 0 ? 12 : hora % 12;
  const sufijo = hora < 12 ? "a.m." : "p.m.";
  return `${h12} ${sufijo}`;
}

function pasaFiltroVeredicto(tipo: VeredictoAnuncio["tipo"], filtro: FiltroVeredicto) {
  if (filtro === "todos") return true;
  if (filtro === "bien") return tipo === "estrella";
  if (filtro === "normal") return tipo === "normal";
  return tipo === "cara" || tipo === "fatiga";
}

export function MetaAdsDashboard({ esAdmin = false }: { esAdmin?: boolean }) {
  const [datos, setDatos] = useState<RespuestaDashboard | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [cuentas, setCuentas] = useState<CuentaPublicitaria[]>([]);
  const [cargandoCuentas, setCargandoCuentas] = useState(true);
  const [seleccionando, setSeleccionando] = useState(false);
  const [errorSeleccion, setErrorSeleccion] = useState("");
  const [errorCuentas, setErrorCuentas] = useState("");
  const [tab, setTab] = useState<Tab>("resumen");
  const [subTab, setSubTab] = useState<"mios" | "tendencia">("mios");
  const [buscar, setBuscar] = useState("");
  const [veredictoFiltro, setVeredictoFiltro] = useState<FiltroVeredicto>("todos");
  const [tendenciaQuery, setTendenciaQuery] = useState("");
  const [tendenciaCargando, setTendenciaCargando] = useState(false);
  const [tendenciaError, setTendenciaError] = useState("");
  const [tendencia, setTendencia] = useState<Array<{ id: string; pageName: string; adText: string }>>([]);
  const [desconectando, setDesconectando] = useState(false);
  const [errorDesconectar, setErrorDesconectar] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("3m");
  const [desdePersonalizado, setDesdePersonalizado] = useState(() => restarDias(isoLocal(new Date()), 6));
  const [hastaPersonalizado, setHastaPersonalizado] = useState(() => isoLocal(new Date()));
  const [horarios, setHorarios] = useState<HorarioData[]>([]);
  const [cargandoHorarios, setCargandoHorarios] = useState(false);
  const [errorHorarios, setErrorHorarios] = useState("");
  const [diasSemana, setDiasSemana] = useState<DiaSemanaData[]>([]);
  const [cargandoDias, setCargandoDias] = useState(false);
  const [errorDias, setErrorDias] = useState("");
  const [refresco, setRefresco] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [errorSync, setErrorSync] = useState("");
  const [mensajeSync, setMensajeSync] = useState("");
  const [accionResultado, setAccionResultado] = useState<string>(ACCION_RESULTADO_POR_DEFECTO);
  const [guardandoAccion, setGuardandoAccion] = useState(false);
  const [errorAccion, setErrorAccion] = useState("");
  const [mensajeAccion, setMensajeAccion] = useState("");
  const [cpaMaximoInput, setCpaMaximoInput] = useState(String(REGLAS_VEREDICTO.maxCostPerResult));
  const [cpaObjetivoInput, setCpaObjetivoInput] = useState(String(REGLAS_VEREDICTO.targetCostPerResult));
  const [guardandoUmbrales, setGuardandoUmbrales] = useState(false);
  const [errorUmbrales, setErrorUmbrales] = useState("");
  const [mensajeUmbrales, setMensajeUmbrales] = useState("");
  const [cambiandoEstadoAnuncio, setCambiandoEstadoAnuncio] = useState<string | null>(null);
  const [errorEstadoAnuncio, setErrorEstadoAnuncio] = useState("");
  const [avisoEstadoAnuncio, setAvisoEstadoAnuncio] = useState("");

  async function elegirCuenta(adAccountId: string) {
    setSeleccionando(true);
    setErrorSeleccion("");
    try {
      const res = await fetch("/api/meta-ads/cuenta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo guardar la cuenta");
      }
      window.location.href = "/meta-ads?conexion=conectado";
    } catch (e) {
      setErrorSeleccion(e instanceof Error ? e.message : "Error al elegir cuenta");
    } finally {
      setSeleccionando(false);
    }
  }

  async function desconectar() {
    if (!confirm("¿Seguro que quieres desconectar tu cuenta publicitaria? Esta acción apaga la conexión y no se puede revertir sin volver a autorizar desde cero.")) return;
    setDesconectando(true);
    setErrorDesconectar("");
    try {
      const res = await fetch("/api/meta-ads/cuenta", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo desconectar la cuenta");
      }
      window.location.href = "/meta-ads?conexion=desconectado";
    } catch (e) {
      setErrorDesconectar(e instanceof Error ? e.message : "Error al desconectar");
    } finally {
      setDesconectando(false);
    }
  }

  async function sincronizarAhora() {
    setSincronizando(true);
    setErrorSync("");
    setMensajeSync("");
    try {
      const res = await fetch("/api/meta-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo sincronizar con Meta");
      setMensajeSync("Sincronización completada. Actualizando datos…");
      setRefresco((valor) => valor + 1);
    } catch (e) {
      setErrorSync(e instanceof Error ? e.message : "Error al sincronizar");
    } finally {
      setSincronizando(false);
    }
  }

  async function cambiarAccionResultado(valor: string) {
    const anterior = accionResultado;
    setAccionResultado(valor);
    setGuardandoAccion(true);
    setErrorAccion("");
    setMensajeAccion("");
    try {
      const res = await fetch("/api/meta-ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accionResultado: valor }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar la preferencia");
      setMensajeAccion("Guardado. Se aplicará en la próxima sincronización.");
    } catch (e) {
      setAccionResultado(anterior);
      setErrorAccion(e instanceof Error ? e.message : "Error al guardar la preferencia");
    } finally {
      setGuardandoAccion(false);
    }
  }

  async function guardarUmbrales() {
    const cpaMaximo = Number(cpaMaximoInput);
    const cpaObjetivo = Number(cpaObjetivoInput);
    if (!Number.isFinite(cpaMaximo) || !Number.isFinite(cpaObjetivo) || cpaMaximo <= 0 || cpaObjetivo <= 0) {
      setErrorUmbrales("Los dos montos deben ser números mayores a cero.");
      setMensajeUmbrales("");
      return;
    }
    if (cpaObjetivo >= cpaMaximo) {
      setErrorUmbrales("El monto barato debe ser menor que el monto caro.");
      setMensajeUmbrales("");
      return;
    }
    setGuardandoUmbrales(true);
    setErrorUmbrales("");
    setMensajeUmbrales("");
    try {
      const res = await fetch("/api/meta-ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ umbrales: { cpaMaximo, cpaObjetivo } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudieron guardar los montos");
      setMensajeUmbrales("Guardado. Los veredictos ya se recalculan con estos montos.");
      // Es cálculo local: basta releer la configuración, sin volver a llamar a Meta.
      setRefresco((valor) => valor + 1);
    } catch (e) {
      setErrorUmbrales(e instanceof Error ? e.message : "Error al guardar los montos");
    } finally {
      setGuardandoUmbrales(false);
    }
  }

  /**
   * Pausa o reanuda un anuncio real. El confirm es obligatorio porque el cambio
   * se aplica en la cuenta de Meta, no solo en este panel.
   */
  async function cambiarEstadoAnuncio(adId: string, estadoActual: "ACTIVE" | "PAUSED") {
    if (!confirm("¿Seguro que quieres pausar/reanudar este anuncio? Esto afecta la cuenta real de Meta.")) return;
    const nuevoEstado = estadoActual === "ACTIVE" ? "PAUSED" : "ACTIVE";
    const verbo = nuevoEstado === "PAUSED" ? "pausar" : "reanudar";
    setCambiandoEstadoAnuncio(adId);
    setErrorEstadoAnuncio("");
    setAvisoEstadoAnuncio("");
    try {
      const res = await fetch(`/api/meta-ads/anuncios/${encodeURIComponent(adId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `No se pudo ${verbo} el anuncio`);
      // Actualiza la pantalla al instante, sin esperar al próximo sync.
      setDatos((prev) => prev
        ? {
            ...prev,
            insights: prev.insights.map((i) =>
              i.adId === adId ? { ...i, estadoAnuncio: nuevoEstado } : i,
            ),
          }
        : prev);
      setAvisoEstadoAnuncio(`Anuncio ${nuevoEstado === "PAUSED" ? "pausado" : "reanudado"} correctamente.`);
    } catch (e) {
      setErrorEstadoAnuncio(e instanceof Error ? e.message : `No se pudo ${verbo} el anuncio`);
    } finally {
      setCambiandoEstadoAnuncio(null);
    }
  }

  async function buscarTendencia() {
    setTendenciaCargando(true);
    setTendenciaError("");
    setTendencia([]);
    try {
      // El endpoint abre Meta Ad Library con Playwright en el servidor.
      const res = await fetch(`/api/meta-ads/tendencia?q=${encodeURIComponent(tendenciaQuery)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Sin respuesta" }));
        throw new Error(data.error || "Error al buscar en Meta Ad Library");
      }
      const result = await res.json();
      setTendencia(result.resultados ?? []);
    } catch (e) {
      setTendenciaError(e instanceof Error ? e.message : "Error al buscar en Meta Ad Library");
    } finally {
      setTendenciaCargando(false);
    }
  }

  useEffect(() => {
    const control = new AbortController();
    fetch("/api/meta-ads/insights", { signal: control.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudieron cargar los resultados de Meta Ads.");
        return (await res.json()) as RespuestaDashboard;
      })
      .then((resultado) => { if (!control.signal.aborted) { setDatos(resultado); setError(""); } })
      .catch((e: unknown) => { if (!control.signal.aborted) setError(e instanceof Error ? e.message : "No se pudieron cargar los resultados."); })
      .finally(() => { if (!control.signal.aborted) setCargando(false); });
    return () => control.abort();
  }, [refresco]);

  useEffect(() => {
    const valor = datos?.connection?.accionResultado;
    if (valor) setAccionResultado(valor);
  }, [datos?.connection?.accionResultado]);

  useEffect(() => {
    const maximo = datos?.connection?.cpaMaximo;
    const objetivo = datos?.connection?.cpaObjetivo;
    if (typeof maximo === "number" && maximo > 0) setCpaMaximoInput(String(maximo));
    if (typeof objetivo === "number" && objetivo > 0) setCpaObjetivoInput(String(objetivo));
  }, [datos?.connection?.cpaMaximo, datos?.connection?.cpaObjetivo]);

  useEffect(() => {
    const control = new AbortController();
    setCargandoHorarios(true);
    fetch("/api/meta-ads/horarios", { signal: control.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudieron cargar los horarios.");
        return (await res.json()) as { horarios?: HorarioData[] };
      })
      .then((resultado) => { if (!control.signal.aborted) { setHorarios(resultado.horarios ?? []); setErrorHorarios(""); } })
      .catch((e: unknown) => { if (!control.signal.aborted) setErrorHorarios(e instanceof Error ? e.message : "No se pudieron cargar los horarios."); })
      .finally(() => { if (!control.signal.aborted) setCargandoHorarios(false); });
    return () => control.abort();
  }, [refresco]);

  useEffect(() => {
    const control = new AbortController();
    setCargandoDias(true);
    fetch("/api/meta-ads/dias-semana", { signal: control.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudieron cargar los días de la semana.");
        return (await res.json()) as { dias?: DiaSemanaData[] };
      })
      .then((resultado) => { if (!control.signal.aborted) { setDiasSemana(resultado.dias ?? []); setErrorDias(""); } })
      .catch((e: unknown) => { if (!control.signal.aborted) setErrorDias(e instanceof Error ? e.message : "No se pudieron cargar los días de la semana."); })
      .finally(() => { if (!control.signal.aborted) setCargandoDias(false); });
    return () => control.abort();
  }, [refresco]);

  useEffect(() => {
    const control = new AbortController();
    fetch("/api/meta-ads/cuenta", { signal: control.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          try { const body = await res.json();
            if (body.error) setErrorCuentas(body.error || "Error al obtener cuentas");
            else setErrorCuentas("No se pudo obtener cuentas");
          } catch { setErrorCuentas("Error al obtener cuentas"); }
          return;
        }
        const resultado = await res.json() as { cuentas?: CuentaPublicitaria[] };
        if (!control.signal.aborted && Array.isArray(resultado.cuentas)) {
          setCuentas(resultado.cuentas);
          setErrorCuentas("");
        }
      })
      .catch(() => { /* fallback a conexión existente */ })
      .finally(() => { if (!control.signal.aborted) setCargandoCuentas(false); });
    return () => control.abort();
  }, []);

  const conexion = datos?.connection ?? null;
  const insights = datos?.insights ?? [];
  const adAccountId = conexion?.adAccountId ?? "";
  const necesitaSeleccion = adAccountId === "<temp>";

  const ahora = new Date();
  const hoyIso = isoLocal(ahora);

  const errorRango = (() => {
    if (periodo !== "personalizado") return "";
    if (!desdePersonalizado || !hastaPersonalizado) return "Elige la fecha de inicio y la de fin.";
    if (desdePersonalizado > hastaPersonalizado) return "La fecha 'Desde' no puede ser posterior a 'Hasta'.";
    const desde = new Date(`${desdePersonalizado}T12:00:00`);
    const hasta = new Date(`${hastaPersonalizado}T12:00:00`);
    const dias = Math.round((hasta.getTime() - desde.getTime()) / 86400000) + 1;
    if (dias > 90) return "Solo se sincronizan los últimos 3 meses (~90 días). Elige un rango más corto.";
    return "";
  })();

  const avisoRango = (() => {
    if (periodo !== "personalizado" || errorRango) return "";
    const limite = restarDias(hoyIso, 89);
    if (desdePersonalizado < limite) return "Solo hay datos de los últimos 3 meses; las fechas anteriores se verán vacías.";
    return "";
  })();

  const inicioIso = periodo === "personalizado"
    ? (errorRango ? hoyIso : desdePersonalizado)
    : restarDias(hoyIso, DIAS_PERIODO[periodo] - 1);
  const finIso = periodo === "personalizado" ? (errorRango ? hoyIso : hastaPersonalizado) : hoyIso;

  const delRango = periodo === "personalizado" && errorRango
    ? []
    : insights.filter((i) => i.fecha >= inicioIso && i.fecha <= finIso);

  const gastoRango = delRango.reduce((total, i) => total + i.spend, 0);
  const impresionesRango = delRango.reduce((total, i) => total + i.impresiones, 0);
  const reachRango = delRango.reduce((total, i) => total + i.reach, 0);
  const conCpa = delRango.filter((i) => i.cpa > 0);
  const cpaPromedio = conCpa.length ? conCpa.reduce((total, i) => total + i.cpa, 0) / conCpa.length : 0;
  const conCtr = delRango.filter((i) => i.impresiones > 0);
  const ctrPromedio = conCtr.length ? conCtr.reduce((total, i) => total + i.ctr, 0) / conCtr.length : 0;
  const cpmRango = impresionesRango > 0 ? (gastoRango / impresionesRango) * 1000 : 0;

  const porAnuncio = new Map<string, { nombre: string; gasto: number; ctr: number; cpa: number; impresiones: number; adId: string; estado: "ACTIVE" | "PAUSED" | null; fechaEstado: string }>();
  for (const insight of delRango) {
    const actual = porAnuncio.get(insight.adId) ?? { nombre: insight.nombreAnuncio, gasto: 0, ctr: 0, cpa: 0, impresiones: 0, adId: insight.adId, estado: null, fechaEstado: "" };
    actual.gasto += insight.spend;
    actual.impresiones += insight.impresiones;
    actual.ctr += insight.ctr;
    actual.cpa += insight.cpa;
    // El estado es del anuncio: manda la fila más reciente que lo traiga.
    if (insight.estadoAnuncio && insight.fecha >= actual.fechaEstado) {
      actual.estado = insight.estadoAnuncio;
      actual.fechaEstado = insight.fecha;
    }
    porAnuncio.set(insight.adId, actual);
  }
  const porAnuncioValues = [...porAnuncio.values()];
  const ctrPortfolio = ctrPortafolio(porAnuncioValues.map((a) => ({
    gasto: a.gasto,
    impresiones: a.impresiones,
    ctr: a.ctr / Math.max(1, delRango.filter((i) => i.adId === a.adId).length),
    cpa: a.cpa,
    activo: true,
    resultados: a.cpa > 0 ? a.gasto / a.cpa : 0,
  })));

  // Umbrales que configuró la organización; si no hay, se usan los defaults del módulo.
  const reglasVeredicto = reglasDeOrganizacion(conexion?.cpaMaximo, conexion?.cpaObjetivo);

  // Agrupa por ad y calcula veredicto
  const ranking = [...porAnuncioValues].map((a) => ({
    ...a,
    ctr: a.ctr / Math.max(1, delRango.filter((i) => i.adId === a.adId).length),
    veredicto: veredictoDeAnuncio({
      gasto: a.gasto,
      impresiones: a.impresiones,
      ctr: a.ctr / Math.max(1, delRango.filter((i) => i.adId === a.adId).length),
      ctrPortafolio: ctrPortfolio,
      cpa: a.cpa,
      activo: true,
      resultados: a.cpa > 0 ? a.gasto / a.cpa : 0,
    }, reglasVeredicto),
  })).sort((a, b) => b.ctr - a.ctr);
  const mejor = ranking[0] ?? null;
  const peor = ranking[ranking.length - 1] ?? null;
  const gastoPorDia = agruparGasto(delRango, periodo);
  const maxDia = Math.max(0.01, ...gastoPorDia.map((barra) => barra.valor));
  const puntosGasto = ultimosPuntos(sumaPorFecha(delRango));
  const puntosImpresiones = ultimosPuntos(serieDiariaImpresiones(delRango));
  const puntosReach = ultimosPuntos(serieDiariaReach(delRango));
  const puntosCtr = ultimosPuntos(serieDiariaCtr(delRango));
  const puntosCpa = ultimosPuntos(serieDiariaCpa(delRango));
  const puntosCpm = ultimosPuntos(serieDiariaCpm(delRango));
  const etiquetaPeriodo = periodo === "personalizado"
    ? (errorRango ? "personalizado" : `${fechaCorta(desdePersonalizado)} – ${fechaCorta(hastaPersonalizado)}`)
    : ETIQUETA_PERIODO[periodo];

  const horasConResultados = horarios
    .filter((h) => h.resultados > 0)
    .map((h) => ({ ...h, costo: h.spend / h.resultados }));
  const mejoresHoras = [...horasConResultados].sort((a, b) => a.costo - b.costo).slice(0, 4);
  const maxGastoHora = Math.max(0.01, ...horarios.map((h) => h.spend));

  const diasConResultados = diasSemana
    .filter((d) => d.resultados > 0)
    .map((d) => ({ ...d, costo: d.spend / d.resultados }));
  const mejoresDias = [...diasConResultados].sort((a, b) => a.costo - b.costo).slice(0, 2);
  const maxGastoDia = Math.max(0.01, ...diasSemana.map((d) => d.spend));

  let textoMejoresDias = "Aún no hay suficientes resultados por día para recomendarte uno.";
  if (mejoresDias.length === 1) {
    textoMejoresDias = `Tu mejor día es el ${NOMBRES_DIA_MIN[mejoresDias[0].dia]}.`;
  } else if (mejoresDias.length >= 2) {
    textoMejoresDias = `Los ${NOMBRES_DIA_MIN[mejoresDias[0].dia]} y ${NOMBRES_DIA_MIN[mejoresDias[1].dia]} te funcionan mejor: consigues resultados más baratos.`;
  }

  const cuentaActual = cuentas.find((c) => c.id === adAccountId);
  const ultimaSync = conexion?.sincronizadoAt
    ? new Date(conexion.sincronizadoAt).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })
    : "Aún no se ha sincronizado";

  const anunciosFiltrados = ranking.filter((a) => {
    if (!pasaFiltroVeredicto(a.veredicto.tipo, veredictoFiltro)) return false;
    if (!buscar.trim()) return true;
    const termino = buscar.toLowerCase();
    return a.nombre.toLowerCase().includes(termino) || a.adId.toLowerCase().includes(termino);
  });

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <EncabezadoPagina
        eyebrow="Marketing y crecimiento"
        titulo="Meta Ads"
        descripcion="Resultados reales de tus anuncios, sin abrir Ads Manager."
        acciones={<Badge tono={conexion ? "primary" : "warning"} punto>{conexion ? "Cuenta conectada" : "Sin conectar"}</Badge>}
      />

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-2 border-b border-border/70 pb-3">
        {(["resumen", "anuncios", "horarios", "configuracion"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"}`}
          >
            {t === "resumen" ? "Resumen" : t === "anuncios" ? "Anuncios" : t === "horarios" ? "Horarios" : "Configuración"}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          Cargando resultados de Meta Ads…
        </div>
      ) : error ? (
        <div role="alert" className="surface space-y-3 p-6">
          <h2 className="font-semibold">No pudimos cargar los resultados</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      ) : !conexion ? (
        <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border bg-card p-6 text-center">
          <div className="max-w-md">
            <h2 className="text-lg font-semibold">Conecta tu cuenta publicitaria</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Autoriza tu cuenta de anuncios de Meta para ver gasto, CTR, CPA y el ranking de tus anuncios, y para pausar o reanudar anuncios desde aquí.
            </p>
            <Boton className="mt-5 min-h-11" onClick={() => { window.location.href = "/api/meta-ads/oauth/iniciar"; }}>Conectar cuenta publicitaria</Boton>
          </div>
        </div>
      ) : !necesitaSeleccion ? (
        <>
          {(tab === "resumen" || tab === "anuncios") && (
            <section className="space-y-3" aria-label="Período de los datos">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Período:</span>
                {PERIODOS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriodo(p)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${periodo === p ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"}`}
                  >
                    {ETIQUETA_PERIODO[p]}
                  </button>
                ))}
              </div>
              {periodo === "personalizado" && (
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                      Desde
                      <input
                        type="date"
                        value={desdePersonalizado}
                        max={hastaPersonalizado || hoyIso}
                        onChange={(e) => setDesdePersonalizado(e.target.value)}
                        className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                      Hasta
                      <input
                        type="date"
                        value={hastaPersonalizado}
                        min={desdePersonalizado}
                        max={hoyIso}
                        onChange={(e) => setHastaPersonalizado(e.target.value)}
                        className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      />
                    </label>
                    <p className={`text-xs ${errorRango ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                      {errorRango || avisoRango || "Máximo ~90 días: es todo lo que se sincroniza desde Meta."}
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}
          {tab === "resumen" && (
            <section className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={`Resumen de ${etiquetaPeriodo}`}>
                <KpiCard
                  titulo="Gasto"
                  valor={dinero(gastoRango)}
                  detalle={`Período: ${etiquetaPeriodo}`}
                  rail="bg-primary"
                  datos={puntosGasto}
                />
                <KpiCard
                  titulo="Impresiones"
                  valor={impresionesRango.toLocaleString("es-MX")}
                  detalle="Veces que se mostró tu anuncio"
                  rail="bg-success"
                  datos={puntosImpresiones}
                />
                <KpiCard
                  titulo="Alcance real"
                  valor={reachRango.toLocaleString("es-MX")}
                  detalle="Personas distintas alcanzadas (aprox.)"
                  rail="bg-success"
                  datos={puntosReach}
                />
                <KpiCard
                  titulo="Tasa de clic (CTR)"
                  valor={`${ctrPromedio.toFixed(2)}%`}
                  detalle="Porcentaje de personas que vieron tu anuncio y le dieron clic."
                  rail="bg-warning"
                  datos={puntosCtr}
                />
                <KpiCard
                  titulo="Costo por resultado (CPA)"
                  valor={conCpa.length ? dinero(cpaPromedio) : "—"}
                  detalle="Costo promedio por cada resultado (mensajes, leads, compras)."
                  rail="bg-destructive"
                  datos={puntosCpa}
                />
                <KpiCard
                  titulo="CPM"
                  valor={cpmRango > 0 ? dinero(cpmRango) : "—"}
                  detalle="Lo que cuesta llegar a 1,000 personas."
                  rail="bg-primary"
                  datos={puntosCpm}
                />
              </div>
            </section>
          )}
          {tab === "resumen" && (
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="surface space-y-3 p-4 sm:p-5">
                <h2 className="text-base font-semibold text-foreground">Mejor anuncio (mayor tasa de clic) - {etiquetaPeriodo}</h2>
                {mejor ? (
                  <div className="space-y-1 text-sm">
                    <Badge tono={VEREDICTO_TONO_MAP[mejor.veredicto.tipo]} className="mb-1">{mejor.veredicto.texto}</Badge>
                    <p className="font-semibold text-foreground">{mejor.nombre}</p>
                    <p className="text-muted-foreground">Tasa de clic: <span className="tnum font-medium text-foreground">{mejor.ctr.toFixed(2)}%</span></p>
                    <p className="text-muted-foreground">Gasto ({etiquetaPeriodo}): <span className="tnum font-medium text-foreground">{dinero(mejor.gasto)}</span></p>
                    <p className="text-muted-foreground">Veces que se mostró: <span className="tnum font-medium text-foreground">{mejor.impresiones.toLocaleString("es-MX")}</span></p>
                  </div>
                ) : <p className="text-sm text-muted-foreground">Todavía no hay datos de anuncios en {etiquetaPeriodo}.</p>}
              </div>
              <div className="surface space-y-3 p-4 sm:p-5">
                <h2 className="text-base font-semibold text-foreground">Peor anuncio (menor tasa de clic) - {etiquetaPeriodo}</h2>
                {peor ? (
                  <div className="space-y-1 text-sm">
                    <Badge tono={VEREDICTO_TONO_MAP[peor.veredicto.tipo]} className="mb-1">{peor.veredicto.texto}</Badge>
                    <p className="font-semibold text-foreground">{peor.nombre}</p>
                    <p className="text-muted-foreground">Tasa de clic: <span className="tnum font-medium text-foreground">{peor.ctr.toFixed(2)}%</span></p>
                    <p className="text-muted-foreground">Gasto ({etiquetaPeriodo}): <span className="tnum font-medium text-foreground">{dinero(peor.gasto)}</span></p>
                    <p className="text-muted-foreground">Veces que se mostró: <span className="tnum font-medium text-foreground">{peor.impresiones.toLocaleString("es-MX")}</span></p>
                  </div>
                ) : <p className="text-sm text-muted-foreground">Todavía no hay datos de anuncios en {etiquetaPeriodo}.</p>}
              </div>
            </section>
          )}
          {tab === "resumen" && (
            <section className="surface space-y-4 p-4 sm:p-5" aria-label="Gasto por días y semanas">
              <h2 className="text-base font-semibold text-foreground">{periodo === "3m" ? "Gasto semanal" : "Gasto diario"}</h2>
              {gastoPorDia.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay gasto registrado.</p>
              ) : (
                <div className="overflow-x-auto pb-1">
                  <div className="flex w-max min-w-full items-end justify-center gap-1.5" role="img" aria-label={periodo === "3m" ? "Gráfica de gasto semanal" : "Gráfica de gasto diario"}>
                    {gastoPorDia.map((barra) => (
                      <div key={barra.clave} className={`group flex shrink-0 flex-col items-center ${periodo === "3m" ? "w-[92px]" : "w-9"}`} title={barra.detalle}>
                        <div className="relative flex h-40 w-full items-end justify-center">
                          <span className="pointer-events-none absolute top-0 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background group-hover:block">{dinero(barra.valor)}</span>
                          <div className="w-8 rounded-t bg-primary/80 transition group-hover:bg-primary" style={{ height: `${Math.max(3, (barra.valor / maxDia) * 100)}%` }} />
                        </div>
                        <span className="mt-1 whitespace-nowrap text-center text-[10px] leading-tight text-muted-foreground">{barra.etiqueta}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{gastoPorDia.length} {gastoPorDia.length === 1 ? (periodo === "3m" ? "semana" : "día") : periodo === "3m" ? "semanas" : "días"} con datos</p>
            </section>
          )}
          {tab === "anuncios" && (
            <section className="surface space-y-3 p-4 sm:p-5" aria-label="Detalle de anuncios">
              <div className="flex flex-wrap gap-2 border-b border-border/70 pb-3">
                {(["mios", "tendencia"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSubTab(s)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${subTab === s ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"}`}
                  >
                    {s === "mios" ? "Míos" : "Tendencia"}
                  </button>
                ))}
              </div>
              {subTab === "mios" && (
                <>
                  <h2 className="text-base font-semibold text-foreground">Anuncios ({etiquetaPeriodo})</h2>
                  <div className="flex flex-wrap gap-2" aria-label="Filtrar por veredicto">
                    {FILTROS_VEREDICTO.map((filtro) => {
                      const activo = veredictoFiltro === filtro.id;
                      const cantidad = ranking.filter((a) => pasaFiltroVeredicto(a.veredicto.tipo, filtro.id)).length;
                      return (
                        <button
                          key={filtro.id}
                          onClick={() => setVeredictoFiltro(filtro.id)}
                          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${activo ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"}`}
                        >
                          {filtro.etiqueta}
                          <span className={`ml-1.5 tnum text-xs ${activo ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{cantidad}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <input
                      type="text"
                      value={buscar}
                      onChange={(e) => setBuscar(e.target.value)}
                      placeholder="Buscar por nombre o ID…"
                      className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    />
                    <span className="text-xs text-muted-foreground">
                      {anunciosFiltrados.length} {anunciosFiltrados.length === 1 ? "registro" : "registros"}
                    </span>
                  </div>
                  {errorEstadoAnuncio ? (
                    <p role="alert" className="text-sm text-destructive">{errorEstadoAnuncio}</p>
                  ) : null}
                  {avisoEstadoAnuncio ? (
                    <p className="text-sm text-success">{avisoEstadoAnuncio}</p>
                  ) : null}
                  {anunciosFiltrados.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay anuncios que coincidan con el filtro en {etiquetaPeriodo}.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-sm">
                        <thead>
                          <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="py-2 pr-3 font-medium">Veredicto</th>
                            <th className="py-2 pr-3 font-medium">Anuncio</th>
                            <th className="py-2 pr-3 text-right font-medium">Gasto</th>
                            <th className="py-2 pr-3 text-right font-medium">Tasa de clic (CTR)</th>
                            <th className="py-2 pr-3 text-right font-medium">Costo por resultado (CPA)</th>
                            <th className="py-2 pr-3 text-right font-medium">Veces que se mostró (impresiones)</th>
                            <th className="py-2 text-right font-medium">{esAdmin ? "Acción" : "Estado"}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {anunciosFiltrados.map((a) => (
                            <tr key={a.adId}>
                              <td className="py-2 pr-3">
                                <Badge tono={VEREDICTO_TONO_MAP[a.veredicto.tipo]}>{a.veredicto.texto}</Badge>
                              </td>
                              <td className="py-2 pr-3"><span className="block font-medium text-foreground">{a.nombre}</span><span className="text-xs text-muted-foreground">{a.adId}</span></td>
                              <td className="tnum py-2 pr-3 text-right">{dinero(a.gasto)}</td>
                              <td className="tnum py-2 pr-3 text-right">{a.ctr.toFixed(2)}%</td>
                              <td className="tnum py-2 pr-3 text-right">{a.cpa > 0 ? dinero(a.cpa) : "—"}</td>
                              <td className="tnum py-2 pr-3 text-right">{a.impresiones.toLocaleString("es-MX")}</td>
                              <td className="py-2 text-right">
                                {a.estado ? (
                                  esAdmin ? (
                                    <Boton
                                      variante={a.estado === "ACTIVE" ? "ghost" : "primary"}
                                      className="min-h-9 px-3 py-1.5 text-xs"
                                      disabled={cambiandoEstadoAnuncio === a.adId}
                                      onClick={() => { if (a.estado) void cambiarEstadoAnuncio(a.adId, a.estado); }}
                                    >
                                      {cambiandoEstadoAnuncio === a.adId
                                        ? "Guardando…"
                                        : a.estado === "ACTIVE" ? "Pausar" : "Reanudar"}
                                    </Boton>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      {a.estado === "ACTIVE" ? "Activo" : "Pausado"}
                                    </span>
                                  )
                                ) : (
                                  <span className="text-xs text-muted-foreground" title="Sincroniza con Meta para conocer el estado de este anuncio.">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
              {subTab === "tendencia" && (
                <>
                  <h2 className="text-base font-semibold text-foreground">Anuncios públicos de tu industria</h2>
                  <p className="text-sm text-muted-foreground">Busca en Meta Ad Library anuncios activos de otras empresas. No son tus anuncios, no hay datos de gasto ni resultados.</p>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <input
                      type="text"
                      value={tendenciaQuery}
                      onChange={(e) => setTendenciaQuery(e.target.value)}
                      placeholder="Palabra clave o giro (ej. zapatos, dentista)…"
                      className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    />
                    <Boton className="min-h-10" onClick={buscarTendencia} disabled={tendenciaCargando || !tendenciaQuery.trim()}>
                      {tendenciaCargando ? "Buscando…" : "Buscar"}
                    </Boton>
                  </div>
                  {tendenciaError ? (
                    <p role="alert" className="text-sm text-destructive">{tendenciaError}</p>
                  ) : tendencia.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay resultados. Prueba con otra palabra clave.</p>
                  ) : (
                    <div className="space-y-2">
                      {tendencia.map((item) => (
                        <div key={item.id} className="surface p-3 space-y-1">
                          <p className="font-medium text-foreground">{item.pageName}</p>
                          <p className="text-sm text-muted-foreground">{item.adText}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          {tab === "horarios" && (
            <div className="space-y-4">
              <section className="surface space-y-4 p-4 sm:p-5" aria-label="Rendimiento por hora">
                <h2 className="text-base font-semibold text-foreground">Mejores horas para anunciar</h2>
                {cargandoHorarios && (
                  <p className="text-sm text-muted-foreground">Cargando horarios...</p>
                )}
                {errorHorarios && (
                  <p role="alert" className="text-sm text-destructive">{errorHorarios}</p>
                )}
                {horarios.length === 0 && !cargandoHorarios && (
                  <p className="text-sm text-muted-foreground">Aún no hay datos de horarios.</p>
                )}
                {horarios.length > 0 && mejoresHoras.length > 0 && (
                  <p className="text-sm text-foreground">
                    Tus anuncios consiguen resultados más baratos cerca de las {mejoresHoras.map(h => etiquetaHora(h.hora)).join(", ")}.
                  </p>
                )}
                <div className="space-y-2">
                  {horarios.map((h) => {
                    const destacado = mejoresHoras.some(m => m.hora === h.hora);
                    return (
                      <div key={h.hora} className="flex items-center gap-3 text-sm">
                        <span className="w-16 shrink-0 text-muted-foreground">{etiquetaHora(h.hora)}</span>
                        <div className="relative h-4 flex-1 overflow-hidden rounded bg-muted">
                          <div
                            className={`h-full ${destacado ? "bg-success" : "bg-primary/60"}`}
                            style={{ width: `${(h.spend / maxGastoHora) * 100}%` }}
                          />
                        </div>
                        <span className="w-24 shrink-0 text-right tnum text-muted-foreground">{dinero(h.spend)}</span>
                        <span className="w-20 shrink-0 text-right tnum text-muted-foreground">{h.resultados} res.</span>
                        {destacado && <Badge tono="success">Mejor costo</Badge>}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="surface space-y-4 p-4 sm:p-5" aria-label="Rendimiento por día de la semana">
                <h2 className="text-base font-semibold text-foreground">Mejores días para anunciar</h2>
                {cargandoDias && (
                  <p className="text-sm text-muted-foreground">Cargando días...</p>
                )}
                {errorDias && (
                  <p role="alert" className="text-sm text-destructive">{errorDias}</p>
                )}
                {diasSemana.length === 0 && !cargandoDias && (
                  <p className="text-sm text-muted-foreground">Aún no hay datos por día de la semana.</p>
                )}
                {diasSemana.length > 0 && (
                  <p className="text-sm text-foreground">{textoMejoresDias}</p>
                )}
                <div className="space-y-2">
                  {diasSemana.map((d) => {
                    const destacado = mejoresDias.some(m => m.dia === d.dia);
                    return (
                      <div key={d.dia} className="flex items-center gap-3 text-sm">
                        <span className="w-20 shrink-0 text-muted-foreground">{NOMBRES_DIA[d.dia] ?? `Día ${d.dia}`}</span>
                        <div className="relative h-4 flex-1 overflow-hidden rounded bg-muted">
                          <div
                            className={`h-full ${destacado ? "bg-success" : "bg-primary/60"}`}
                            style={{ width: `${(d.spend / maxGastoDia) * 100}%` }}
                          />
                        </div>
                        <span className="w-24 shrink-0 text-right tnum text-muted-foreground">{dinero(d.spend)}</span>
                        <span className="w-20 shrink-0 text-right tnum text-muted-foreground">{d.resultados} res.</span>
                        {destacado && <Badge tono="success">Mejor costo</Badge>}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
          {tab === "configuracion" && (
            <section className="surface space-y-4 p-4 sm:p-5" aria-label="Configuración de la cuenta">
              <h2 className="text-base font-semibold text-foreground">Configuración de la cuenta</h2>
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-foreground">Cuenta conectada</p>
                <p className="text-muted-foreground">
                  {cuentaActual ? `${cuentaActual.nombre} (${cuentaActual.id})` : adAccountId}
                </p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-foreground">Estado</p>
                <p className="text-muted-foreground">
                  <Badge tono={conexion?.estado === "activa" ? "success" : "warning"} punto>{conexion?.estado === "activa" ? "Activa" : conexion?.estado === "requiere_reconectar" ? "Requiere reconectar" : "Inactiva"}</Badge>
                </p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-foreground">Último sync</p>
                <p className="text-muted-foreground">{ultimaSync}</p>
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-foreground">Sincronización</p>
                <Boton variante="primary" className="min-h-10" disabled={sincronizando} onClick={sincronizarAhora}>
                  {sincronizando ? "Sincronizando…" : "Sincronizar ahora"}
                </Boton>
                {mensajeSync ? <p className="text-sm text-success">{mensajeSync}</p> : null}
                {errorSync ? <p role="alert" className="text-sm text-destructive">{errorSync}</p> : null}
                <p className="text-xs text-muted-foreground">Trae los últimos datos desde Meta sin esperar a la sincronización automática.</p>
              </div>
              <div className="space-y-2 text-sm">
                <label htmlFor="accion-resultado" className="font-semibold text-foreground">¿Qué cuenta como resultado para ti?</label>
                <select
                  id="accion-resultado"
                  value={accionResultado}
                  disabled={guardandoAccion}
                  onChange={(e) => void cambiarAccionResultado(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {ACCIONES_RESULTADO.map((opcion) => (
                    <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Se usa para calcular el costo por resultado. Si eliges una, solo contaremos esa; se aplica en la próxima sincronización.</p>
                {mensajeAccion ? <p className="text-sm text-success">{mensajeAccion}</p> : null}
                {errorAccion ? <p role="alert" className="text-sm text-destructive">{errorAccion}</p> : null}
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-foreground">¿Cuándo un anuncio es bueno o malo?</p>
                <p className="text-xs text-muted-foreground">
                  Montos en pesos por cada resultado. Solo cambian cómo se clasifican tus anuncios aquí; no modifican nada en Meta.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label htmlFor="cpa-maximo" className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    ¿Cuánto es demasiado caro por resultado?
                    <input
                      id="cpa-maximo"
                      type="number"
                      inputMode="decimal"
                      min="1"
                      step="1"
                      value={cpaMaximoInput}
                      disabled={guardandoUmbrales}
                      onChange={(e) => setCpaMaximoInput(e.target.value)}
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    />
                  </label>
                  <label htmlFor="cpa-objetivo" className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    ¿Cuánto sería un resultado barato?
                    <input
                      id="cpa-objetivo"
                      type="number"
                      inputMode="decimal"
                      min="1"
                      step="1"
                      value={cpaObjetivoInput}
                      disabled={guardandoUmbrales}
                      onChange={(e) => setCpaObjetivoInput(e.target.value)}
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    />
                  </label>
                </div>
                <Boton variante="primary" className="min-h-10" disabled={guardandoUmbrales} onClick={guardarUmbrales}>
                  {guardandoUmbrales ? "Guardando…" : "Guardar montos"}
                </Boton>
                {mensajeUmbrales ? <p className="text-sm text-success">{mensajeUmbrales}</p> : null}
                {errorUmbrales ? <p role="alert" className="text-sm text-destructive">{errorUmbrales}</p> : null}
                <p className="text-xs text-muted-foreground">
                  Valores por defecto: $60 demasiado caro y $30 como resultado barato. Se aplican al instante, sin volver a sincronizar con Meta.
                </p>
              </div>
              {conexion?.ultimoError ? (
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-destructive">Último error</p>
                  <p className="text-destructive">{conexion.ultimoError}</p>
                </div>
              ) : null}
              {errorDesconectar ? (
                <p role="alert" className="text-sm text-destructive">{errorDesconectar}</p>
              ) : null}
              <Boton variante="danger" className="mt-2 min-h-11" disabled={desconectando} onClick={desconectar}>
                {desconectando ? "Desconectando…" : "Desconectar cuenta publicitaria"}
              </Boton>
              <p className="text-xs text-muted-foreground">
                Al desconectar se apaga la conexión. Para volver a verla necesitarás autorizar de nuevo desde cero.
              </p>
            </section>
          )}
        </>
      ) : (
        <div className="surface space-y-4 p-4 sm:p-5">
          <h2 className="text-base font-semibold text-foreground">Selecciona tu cuenta publicitaria</h2>
          <p className="text-sm text-muted-foreground">
            Estas son las cuentas publicitarias de tu empresa en Meta. Elige la que quieres ver en este panel.
          </p>
          {errorSeleccion ? (
            <p role="alert" className="text-sm text-destructive">{errorSeleccion}</p>
          ) : null}
          {cargandoCuentas ? (
            <p className="text-sm text-muted-foreground">Cargando cuentas…</p>
          ) : errorCuentas ? (
            <p role="alert" className="text-sm text-destructive">{errorCuentas}</p>
          ) : cuentas.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">No se encontraron cuentas publicitarias en tu cuenta de Meta.</p>
              <Boton className="mt-5 min-h-11" onClick={() => { window.location.href = "/api/meta-ads/oauth/iniciar"; }}>Intentar conectar de nuevo</Boton>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Cuenta</th>
                    <th className="py-2 pr-3 text-right font-medium">Estado</th>
                    <th className="py-2 text-right font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {cuentas.map((cuenta) => (
                    <tr key={cuenta.id}>
                      <td className="py-2 pr-3"><span className="block font-medium text-foreground">{cuenta.nombre}</span><span className="text-xs text-muted-foreground">{cuenta.id}</span></td>
                      <td className="py-2 pr-3 text-right"><Badge tono={cuenta.estado === 1 ? "success" : "warning"} punto>{cuenta.estado === 1 ? "Activa" : "Inactiva"}</Badge></td>
                      <td className="py-2 text-right">
                        <Boton variante="primary" className="min-h-9" disabled={seleccionando} onClick={() => elegirCuenta(cuenta.id)}>
                          {seleccionando ? "Guardando…" : "Seleccionar"}
                        </Boton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
