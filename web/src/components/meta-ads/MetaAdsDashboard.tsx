"use client";

import { useEffect, useState } from "react";
import { Badge, Boton, EncabezadoPagina } from "@/components/ui";
import { veredictoDeAnuncio, ctrPortafolio, type DatosVeredicto, type VeredictoAnuncio } from "@/lib/meta-ads/veredicto";

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
} | null;

type RespuestaDashboard = { connection: ConexionData; insights: InsightData[] };

type Tab = "resumen" | "anuncios" | "configuracion";

function dinero(valor: number) {
  return valor.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}

function sumaPorFecha(insights: InsightData[]) {
  const mapa = new Map<string, number>();
  for (const insight of insights) mapa.set(insight.fecha, (mapa.get(insight.fecha) ?? 0) + insight.spend);
  return [...mapa.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export function MetaAdsDashboard() {
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
  const [tendenciaQuery, setTendenciaQuery] = useState("");
  const [tendenciaCargando, setTendenciaCargando] = useState(false);
  const [tendenciaError, setTendenciaError] = useState("");
  const [tendencia, setTendencia] = useState<Array<{ id: string; pageName: string; adText: string }>>([]);
  const [desconectando, setDesconectando] = useState(false);
  const [errorDesconectar, setErrorDesconectar] = useState("");

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

  async function buscarTendencia() {
    setTendenciaCargando(true);
    setTendenciaError("");
    setTendencia([]);
    try {
      // Llama al endpoint /api/meta-ads/tendencia?q= que usa token de app, no ads_read del cliente
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
  }, []);

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
  const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 89);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  fin.setHours(23, 59, 59, 999);
  const delRango = insights.filter((i) => {
    const fecha = new Date(`${i.fecha}T00:00:00Z`);
    return fecha >= inicio && fecha <= fin;
  });

  const gastoRango = delRango.reduce((total, i) => total + i.spend, 0);
  const impresionesRango = delRango.reduce((total, i) => total + i.impresiones, 0);
  const conCpa = delRango.filter((i) => i.cpa > 0);
  const cpaPromedio = conCpa.length ? conCpa.reduce((total, i) => total + i.cpa, 0) / conCpa.length : 0;
  const conCtr = delRango.filter((i) => i.impresiones > 0);
  const ctrPromedio = conCtr.length ? conCtr.reduce((total, i) => total + i.ctr, 0) / conCtr.length : 0;

  const porAnuncio = new Map<string, { nombre: string; gasto: number; ctr: number; cpa: number; impresiones: number; adId: string }>();
  for (const insight of delRango) {
    const actual = porAnuncio.get(insight.adId) ?? { nombre: insight.nombreAnuncio, gasto: 0, ctr: 0, cpa: 0, impresiones: 0, adId: insight.adId };
    actual.gasto += insight.spend;
    actual.impresiones += insight.impresiones;
    actual.ctr += insight.ctr;
    actual.cpa += insight.cpa;
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
    }),
  })).sort((a, b) => b.ctr - a.ctr);
  const mejor = ranking[0] ?? null;
  const peor = ranking[ranking.length - 1] ?? null;
  const gastoPorDia = sumaPorFecha(delRango);
  const maxDia = Math.max(0.01, ...gastoPorDia.map(([, valor]) => valor));

  const cuentaActual = cuentas.find((c) => c.id === adAccountId);
  const ultimaSync = conexion?.sincronizadoAt
    ? new Date(conexion.sincronizadoAt).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })
    : "Aún no se ha sincronizado";

  const anunciosFiltrados = buscar.trim()
    ? ranking.filter((a) =>
        a.nombre.toLowerCase().includes(buscar.toLowerCase()) ||
        a.adId.toLowerCase().includes(buscar.toLowerCase()),
      )
    : ranking;

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
        {(["resumen", "anuncios", "configuracion"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"}`}
          >
            {t === "resumen" ? "Resumen" : t === "anuncios" ? "Anuncios" : "Configuración"}
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
              Autoriza el acceso de solo lectura a tu cuenta de anuncios de Meta para ver gasto, CTR, CPA y el ranking de tus anuncios aquí dentro.
            </p>
            <Boton className="mt-5 min-h-11" onClick={() => { window.location.href = "/api/meta-ads/oauth/iniciar"; }}>Conectar cuenta publicitaria</Boton>
          </div>
        </div>
      ) : !necesitaSeleccion ? (
        <>
          {tab === "resumen" && (
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumen de los últimos 3 meses">
              <div className="surface p-4 sm:p-5"><p className="text-sm text-muted-foreground">Gasto (últimos 3 meses)</p><p className="tnum mt-3 text-2xl font-bold text-foreground">{dinero(gastoRango)}</p></div>
              <div className="surface p-4 sm:p-5"><p className="text-sm text-muted-foreground">Veces que se mostró tu anuncio (impresiones)</p><p className="tnum mt-3 text-2xl font-bold text-foreground">{impresionesRango.toLocaleString("es-MX")}</p></div>
              <div className="surface p-4 sm:p-5"><p className="text-sm text-muted-foreground">Tasa de clic (CTR)</p><p className="tnum mt-3 text-2xl font-bold text-foreground">{ctrPromedio.toFixed(2)}%</p><p className="mt-1 text-xs text-muted-foreground">Porcentaje de personas que vieron tu anuncio y le dieron clic.</p></div>
              <div className="surface p-4 sm:p-5"><p className="text-sm text-muted-foreground">Costo por resultado (CPA)</p><p className="tnum mt-3 text-2xl font-bold text-foreground">{conCpa.length ? dinero(cpaPromedio) : "—"}</p><p className="mt-1 text-xs text-muted-foreground">Costo promedio por cada resultado (mensajes, leads, compras).</p></div>
            </section>
          )}
          {tab === "resumen" && (
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="surface space-y-3 p-4 sm:p-5">
                <h2 className="text-base font-semibold text-foreground">Mejor anuncio (mayor tasa de clic)</h2>
                {mejor ? (
                  <div className="space-y-1 text-sm">
                    <Badge tono={VEREDICTO_TONO_MAP[mejor.veredicto.tipo]} className="mb-1">{mejor.veredicto.texto}</Badge>
                    <p className="font-semibold text-foreground">{mejor.nombre}</p>
                    <p className="text-muted-foreground">Tasa de clic: <span className="tnum font-medium text-foreground">{mejor.ctr.toFixed(2)}%</span></p>
                    <p className="text-muted-foreground">Gasto (3 meses): <span className="tnum font-medium text-foreground">{dinero(mejor.gasto)}</span></p>
                    <p className="text-muted-foreground">Veces que se mostró: <span className="tnum font-medium text-foreground">{mejor.impresiones.toLocaleString("es-MX")}</span></p>
                  </div>
                ) : <p className="text-sm text-muted-foreground">Todavía no hay datos de anuncios en los últimos 3 meses.</p>}
              </div>
              <div className="surface space-y-3 p-4 sm:p-5">
                <h2 className="text-base font-semibold text-foreground">Peor anuncio (menor tasa de clic)</h2>
                {peor ? (
                  <div className="space-y-1 text-sm">
                    <Badge tono={VEREDICTO_TONO_MAP[peor.veredicto.tipo]} className="mb-1">{peor.veredicto.texto}</Badge>
                    <p className="font-semibold text-foreground">{peor.nombre}</p>
                    <p className="text-muted-foreground">Tasa de clic: <span className="tnum font-medium text-foreground">{peor.ctr.toFixed(2)}%</span></p>
                    <p className="text-muted-foreground">Gasto (3 meses): <span className="tnum font-medium text-foreground">{dinero(peor.gasto)}</span></p>
                    <p className="text-muted-foreground">Veces que se mostró: <span className="tnum font-medium text-foreground">{peor.impresiones.toLocaleString("es-MX")}</span></p>
                  </div>
                ) : <p className="text-sm text-muted-foreground">Todavía no hay datos de anuncios en los últimos 3 meses.</p>}
              </div>
            </section>
          )}
          {tab === "resumen" && (
            <section className="surface space-y-4 p-4 sm:p-5" aria-label="Gasto diario">
              <h2 className="text-base font-semibold text-foreground">Gasto diario</h2>
              {gastoPorDia.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay gasto registrado.</p>
              ) : (
                <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Gráfica de gasto diario">
                  {gastoPorDia.map(([fecha, valor]) => (
                    <div key={fecha} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
                      <div className="rounded-t bg-primary/80 transition group-hover:bg-primary" style={{ height: `${Math.max(3, (valor / maxDia) * 100)}%` }} />
                      <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background group-hover:block">{dinero(valor)}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{gastoPorDia.length} {gastoPorDia.length === 1 ? "día" : "días"} con datos</p>
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
                  <h2 className="text-base font-semibold text-foreground">Anuncios (últimos 3 meses)</h2>
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
                  {anunciosFiltrados.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Todavía no hay datos de anuncios en los últimos 3 meses.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead>
                          <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="py-2 pr-3 font-medium">Veredicto</th>
                            <th className="py-2 pr-3 font-medium">Anuncio</th>
                            <th className="py-2 pr-3 text-right font-medium">Gasto</th>
                            <th className="py-2 pr-3 text-right font-medium">Tasa de clic (CTR)</th>
                            <th className="py-2 pr-3 text-right font-medium">Costo por resultado (CPA)</th>
                            <th className="py-2 text-right font-medium">Veces que se mostró (impresiones)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {[...anunciosFiltrados].map((a) => (
                            <tr key={a.adId}>
                              <td className="py-2 pr-3">
                                <Badge tono={VEREDICTO_TONO_MAP[a.veredicto.tipo]}>{a.veredicto.texto}</Badge>
                              </td>
                              <td className="py-2 pr-3"><span className="block font-medium text-foreground">{a.nombre}</span><span className="text-xs text-muted-foreground">{a.adId}</span></td>
                              <td className="tnum py-2 pr-3 text-right">{dinero(a.gasto)}</td>
                              <td className="tnum py-2 pr-3 text-right">{a.ctr.toFixed(2)}%</td>
                              <td className="tnum py-2 pr-3 text-right">{a.cpa > 0 ? dinero(a.cpa) : "—"}</td>
                              <td className="tnum py-2 text-right">{a.impresiones.toLocaleString("es-MX")}</td>
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
