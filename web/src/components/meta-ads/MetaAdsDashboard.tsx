"use client";

import { useEffect, useState } from "react";
import { Badge, Boton, EncabezadoPagina } from "@/components/ui";

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
  id: string; // id de la cuenta (con prefijo act_ cuando es necesario)
  nombre: string;
  estado: number;
};

type ConexionData = { id: string; adAccountId: string; estado: string } | null;

type RespuestaDashboard = { connection: ConexionData; insights: InsightData[] };

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
        if (!res.ok) return;
        const resultado = await res.json() as { cuentas?: CuentaPublicitaria[] };
        if (!control.signal.aborted && Array.isArray(resultado.cuentas)) setCuentas(resultado.cuentas);
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
  const inicioMes = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), 1));
  const finMes = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth() + 1, 1));
  const delMes = insights.filter((i) => {
    const fecha = new Date(`${i.fecha}T00:00:00Z`);
    return fecha >= inicioMes && fecha < finMes;
  });

  const gastoMes = delMes.reduce((total, i) => total + i.spend, 0);
  const impresionesMes = delMes.reduce((total, i) => total + i.impresiones, 0);
  const conCpa = delMes.filter((i) => i.cpa > 0);
  const cpaPromedio = conCpa.length ? conCpa.reduce((total, i) => total + i.cpa, 0) / conCpa.length : 0;
  const conCtr = delMes.filter((i) => i.impresiones > 0);
  const ctrPromedio = conCtr.length ? conCtr.reduce((total, i) => total + i.ctr, 0) / conCtr.length : 0;

  const porAnuncio = new Map<string, { nombre: string; gasto: number; ctr: number; cpa: number; impresiones: number }>();
  for (const insight of delMes) {
    const actual = porAnuncio.get(insight.adId) ?? { nombre: insight.nombreAnuncio, gasto: 0, ctr: 0, cpa: 0, impresiones: 0, dias: 0 } as { nombre: string; gasto: number; ctr: number; cpa: number; impresiones: number };
    actual.gasto += insight.spend;
    actual.impresiones += insight.impresiones;
    actual.ctr += insight.ctr;
    actual.cpa += insight.cpa;
    porAnuncio.set(insight.adId, actual);
  }
  const ranking = [...porAnuncio.values()]
    .map((a) => ({ ...a, ctr: a.ctr / Math.max(1, a.impresiones > 0 ? delMes.filter((i) => i.impresiones > 0).length : 1) }))
    .sort((a, b) => b.ctr - a.ctr);
  const mejor = ranking[0] ?? null;
  const peor = ranking[ranking.length - 1] ?? null;
  const gastoPorDia = sumaPorFecha(delMes);
  const maxDia = Math.max(0.01, ...gastoPorDia.map(([, valor]) => valor));

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <EncabezadoPagina
        eyebrow="Marketing y crecimiento"
        titulo="Meta Ads"
        descripcion="Resultados reales de tus anuncios, sin abrir Ads Manager."
        acciones={<Badge tono={conexion ? "success" : "warning"} punto>{conexion ? "Cuenta conectada" : "Sin conectar"}</Badge>}
      />

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
              Autoriza el acceso de solo lectura a tu cuenta de anuncios de Meta para ver gasto,
              CTR, CPA y el ranking de tus anuncios aquí dentro.
            </p>
            <Boton className="mt-5 min-h-11" onClick={() => { window.location.href = "/api/meta-ads/oauth/iniciar"; }}>
              Conectar cuenta publicitaria
            </Boton>
          </div>
        </div>
      ) : !necesitaSeleccion ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumen del mes">
            <div className="surface p-4 sm:p-5"><p className="text-sm text-muted-foreground">Gasto del mes</p><p className="tnum mt-3 text-2xl font-bold text-foreground">{dinero(gastoMes)}</p></div>
            <div className="surface p-4 sm:p-5"><p className="text-sm text-muted-foreground">Impresiones</p><p className="tnum mt-3 text-2xl font-bold text-foreground">{impresionesMes.toLocaleString("es-MX")}</p></div>
            <div className="surface p-4 sm:p-5"><p className="text-sm text-muted-foreground">CTR promedio</p><p className="tnum mt-3 text-2xl font-bold text-foreground">{ctrPromedio.toFixed(2)}%</p></div>
            <div className="surface p-4 sm:p-5"><p className="text-sm text-muted-foreground">CPA promedio</p><p className="tnum mt-3 text-2xl font-bold text-foreground">{conCpa.length ? dinero(cpaPromedio) : "—"}</p></div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="surface space-y-3 p-4 sm:p-5">
              <h2 className="text-base font-semibold text-foreground">Mejor anuncio</h2>
              {mejor ? (
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-foreground">{mejor.nombre} <Badge tono="success">Mejor CTR</Badge></p>
                  <p className="text-muted-foreground">CTR promedio: <span className="tnum font-medium text-foreground">{mejor.ctr.toFixed(2)}%</span></p>
                  <p className="text-muted-foreground">Gasto del mes: <span className="tnum font-medium text-foreground">{dinero(mejor.gasto)}</span></p>
                  <p className="text-muted-foreground">Impresiones: <span className="tnum font-medium text-foreground">{mejor.impresiones.toLocaleString("es-MX")}</span></p>
                </div>
              ) : <p className="text-sm text-muted-foreground">Todavía no hay datos de anuncios este mes.</p>}
            </div>
            <div className="surface space-y-3 p-4 sm:p-5">
              <h2 className="text-base font-semibold text-foreground">Peor anuncio</h2>
              {peor ? (
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-foreground">{peor.nombre} <Badge tono="destructive">Menor CTR</Badge></p>
                  <p className="text-muted-foreground">CTR promedio: <span className="tnum font-medium text-foreground">{peor.ctr.toFixed(2)}%</span></p>
                  <p className="text-muted-foreground">Gasto del mes: <span className="tnum font-medium text-foreground">{dinero(peor.gasto)}</span></p>
                  <p className="text-muted-foreground">Impresiones: <span className="tnum font-medium text-foreground">{peor.impresiones.toLocaleString("es-MX")}</span></p>
                </div>
              ) : <p className="text-sm text-muted-foreground">Todavía no hay datos de anuncios este mes.</p>}
            </div>
          </section>

          <section className="surface space-y-4 p-4 sm:p-5" aria-label="Gasto diario del mes">
            <h2 className="text-base font-semibold text-foreground">Gasto diario</h2>
            {gastoPorDia.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay gasto registrado este mes.</p>
            ) : (
              <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Gráfica de gasto diario del mes">
                {gastoPorDia.map(([fecha, valor]) => (
                  <div key={fecha} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
                    <div className="rounded-t bg-primary/80 transition group-hover:bg-primary" style={{ height: `${Math.max(3, (valor / maxDia) * 100)}%` }} />
                    <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background group-hover:block">{dinero(valor)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{gastoPorDia.length} {gastoPorDia.length === 1 ? "día" : "días"} con datos · del 1 al hoy</p>
          </section>

          <section className="surface space-y-3 p-4 sm:p-5" aria-label="Detalle de anuncios">
            <h2 className="text-base font-semibold text-foreground">Anuncios del mes</h2>
            {delMes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay snapshots este mes. El sync corre cada pocas horas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Anuncio</th>
                      <th className="py-2 pr-3 text-right font-medium">Gasto</th>
                      <th className="py-2 pr-3 text-right font-medium">CTR</th>
                      <th className="py-2 pr-3 text-right font-medium">CPA</th>
                      <th className="py-2 text-right font-medium">Impresiones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {[...delMes].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 25).map((insight) => (
                      <tr key={insight.id}>
                        <td className="py-2 pr-3"><span className="block font-medium text-foreground">{insight.nombreAnuncio}</span><span className="text-xs text-muted-foreground">{insight.fecha}</span></td>
                        <td className="tnum py-2 pr-3 text-right">{dinero(insight.spend)}</td>
                        <td className="tnum py-2 pr-3 text-right">{insight.ctr.toFixed(2)}%</td>
                        <td className="tnum py-2 pr-3 text-right">{insight.cpa > 0 ? dinero(insight.cpa) : "—"}</td>
                        <td className="tnum py-2 text-right">{insight.impresiones.toLocaleString("es-MX")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
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
          ) : cuentas.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">No se encontraron cuentas publicitarias en tu cuenta de Meta.</p>
              <Boton className="mt-5 min-h-11" onClick={() => { window.location.href = "/api/meta-ads/oauth/iniciar"; }}>
                Intentar conectar de nuevo
              </Boton>
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