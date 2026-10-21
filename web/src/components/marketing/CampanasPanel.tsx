"use client";

import { useEffect, useState } from "react";
import { Badge, Boton, CLASE_CAMPO, EncabezadoPagina } from "@/components/ui";
import type { CampanaMarketingDto, EstadoCampana, ListaCampanasDto, TipoCampana } from "@/lib/marketing";
import { CANALES_UI, ESTADOS_UI, OBJETIVOS_UI, endpointCampanas, fechaCampana, presupuestoCampana, respuestaCampana } from "./presentacion";
import { FormularioCampana } from "./FormularioCampana";
import { DetalleCampana } from "./DetalleCampana";
import { CargaCampanas } from "./CargaCampanas";

export function CampanasPanel({ tipo, esAdmin }: { tipo: TipoCampana; esAdmin: boolean }) {
  const esAds = tipo === "meta_ads";
  const [filtros, setFiltros] = useState({ q: "", estado: "" as EstadoCampana | "", page: 1 });
  const [busqueda, setBusqueda] = useState("");
  const [datos, setDatos] = useState<ListaCampanasDto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [revision, setRevision] = useState(0);
  const [seleccionada, setSeleccionada] = useState<CampanaMarketingDto | null>(null);
  const [editor, setEditor] = useState<CampanaMarketingDto | "nueva" | null>(null);
  useEffect(() => {
    const control = new AbortController();
    const consulta = new URLSearchParams({ q: filtros.q, estado: filtros.estado, page: String(filtros.page) });
    fetch(`${endpointCampanas(tipo)}?${consulta}`, { signal: control.signal, cache: "no-store" })
      .then(respuestaCampana<ListaCampanasDto>)
      .then((resultado) => { if (!control.signal.aborted) {
        const ultimaPagina = Math.max(1, Math.ceil(resultado.total / resultado.limite));
        if (resultado.page > ultimaPagina) { setFiltros((actual) => ({ ...actual, page: ultimaPagina })); return; }
        setDatos(resultado); setError("");
      } })
      .catch((e: unknown) => { if (!control.signal.aborted) setError(e instanceof Error ? e.message : "No pudimos cargar tus campañas."); })
      .finally(() => { if (!control.signal.aborted) setCargando(false); });
    return () => control.abort();
  }, [filtros, tipo, revision]);
  function filtrar(cambios: Partial<typeof filtros>) {
    setCargando(true); setError(""); setFiltros((actual) => ({ ...actual, ...cambios }));
  }
  function refrescar() { setCargando(true); setRevision((actual) => actual + 1); }
  function guardada(campana: CampanaMarketingDto) {
    setEditor(null); setSeleccionada(campana); setAviso("Borrador guardado. Puedes completar los datos o enviarlo a revisión."); refrescar();
  }
  const resumen = datos?.resumen;
  const total = resumen ? Object.values(resumen).reduce((suma, valor) => suma + valor, 0) : 0;
  const estados = Object.keys(ESTADOS_UI) as EstadoCampana[];
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
      <EncabezadoPagina eyebrow="Marketing y crecimiento" titulo={esAds ? "Meta Ads" : "Marketing"}
        descripcion={esAds ? "Prepara anuncios que tu equipo pueda entender, revisar y aprobar." : "Convierte tus ideas en campañas con un objetivo y un siguiente paso claro."}
        acciones={<Boton className="min-h-11" onClick={() => { setEditor("nueva"); setAviso(""); }}>＋ {esAds ? "Nueva propuesta" : "Nueva campaña"}</Boton>} />
      {aviso && <p role="status" className="rounded-lg border border-success/20 bg-success/5 px-4 py-3 text-sm">{aviso}</p>}
      {esAds && <section aria-label="Estado de conexión con Meta" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-info/20 bg-info/5 p-4">
        <div><p className="text-sm font-semibold">Conexión con Meta pendiente</p><p className="mt-1 text-sm text-muted-foreground">Ya puedes preparar y aprobar propuestas. Publicar anuncios y consultar resultados reales estará disponible al integrar la cuenta publicitaria.</p></div>
        <Badge tono="info">Planificación interna</Badge>
      </section>}
      <section className="grid gap-4 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 via-card to-card p-5 sm:p-6 lg:grid-cols-[1.05fr_1.4fr]">
        <div><h2 className="text-lg font-semibold">{esAds ? "Del objetivo a una propuesta lista" : "Una buena campaña empieza con una idea clara"}</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{esAds ? "Define a quién quieres llegar, qué vas a decir y cuánto propones invertir. La aprobación de tu equipo queda registrada aquí." : "Ten el objetivo, el público y el mensaje en un solo lugar. Guarda tus avances y pide revisión cuando estés listo."}</p></div>
        <ol className="grid gap-4 sm:grid-cols-3">
          {[
            ["Prepara", "Define el objetivo y escribe tu mensaje."],
            ["Revisa", "Completa las fechas y el presupuesto."],
            ["Aprueba", "Un administrador valida el plan."],
          ].map(([titulo, texto], i) => <li key={titulo} className="flex gap-3 sm:block"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{i + 1}</span><div><h3 className="text-sm font-semibold sm:mt-3">{titulo}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{texto}</p></div></li>)}
        </ol>
      </section>
      <section aria-label={esAds ? "Propuestas de anuncios" : "Campañas"} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{esAds ? "Tus propuestas" : "Tus campañas"}</h2><p className="text-xs text-muted-foreground">{esAds ? "Los presupuestos son propuestas, no gasto real." : "Guardar una campaña no envía ni publica contenido."}</p></div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex max-w-full flex-wrap gap-1 rounded-xl bg-muted/60 p-1" aria-label="Filtrar por estado">
            <button type="button" aria-pressed={!filtros.estado} className={`min-h-11 rounded-lg px-3 text-sm ${!filtros.estado ? "bg-card font-semibold shadow-soft" : "text-muted-foreground hover:bg-card/60"}`} onClick={() => filtrar({ estado: "", page: 1 })}>Todas {!cargando && !error && datos && <span className="tnum ml-1 text-xs text-muted-foreground">{total}</span>}</button>
            {estados.map((estado) => <button key={estado} type="button" aria-pressed={filtros.estado === estado} className={`min-h-11 rounded-lg px-3 text-sm ${filtros.estado === estado ? "bg-card font-semibold shadow-soft" : "text-muted-foreground hover:bg-card/60"}`} onClick={() => filtrar({ estado, page: 1 })}>{estado === "aprobada" ? "Aprobadas" : estado === "borrador" ? "Borradores" : estado === "archivada" ? "Archivadas" : "Por revisar"}{!cargando && !error && resumen && <span className="tnum ml-1 text-xs text-muted-foreground">{resumen[estado]}</span>}</button>)}
          </div>
          <form role="search" className="flex w-full gap-2 sm:w-auto" onSubmit={(e) => { e.preventDefault(); filtrar({ q: busqueda.trim(), page: 1 }); }}>
            <label className="min-w-0 flex-1"><span className="sr-only">Buscar campañas por nombre o público</span><input type="search" maxLength={120} placeholder="Buscar por nombre o público…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className={`${CLASE_CAMPO} min-h-11 sm:w-64`} /></label><Boton type="submit" variante="ghost" className="min-h-11">Buscar</Boton>
          </form>
        </div>
        {filtros.q && <p className="text-sm text-muted-foreground">Resultados para “{filtros.q}” <button className="ml-2 min-h-10 font-medium text-primary underline underline-offset-4" onClick={() => { setBusqueda(""); filtrar({ q: "", page: 1 }); }}>Limpiar búsqueda</button></p>}
        {error ? <div role="alert" className="surface space-y-3 p-6"><h3 className="font-semibold">No pudimos cargar las campañas</h3><p className="text-sm text-muted-foreground">{error}</p><Boton onClick={refrescar}>Reintentar</Boton></div> : cargando ? <CargaCampanas /> : datos?.campanas.length ? <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {datos.campanas.map((campana) => <article key={campana.id} className="surface flex min-w-0 flex-col p-5 transition hover:border-primary/30">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><Badge tono={ESTADOS_UI[campana.estado].tono} punto>{ESTADOS_UI[campana.estado].nombre}</Badge><span className="text-xs text-muted-foreground">{CANALES_UI[campana.canal]}</span></div>
              <h3 className="break-words text-base font-semibold [overflow-wrap:anywhere]">{campana.nombre}</h3><p className="mt-1 text-xs text-primary">{OBJETIVOS_UI[campana.objetivo].nombre}</p>
              <p className="mt-3 line-clamp-2 break-words text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{campana.contenido || "Empieza por escribir el mensaje que quieres compartir."}</p>
              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border/70 pt-4 text-xs"><div><dt className="text-muted-foreground">Inicio previsto</dt><dd className="mt-1 font-medium">{fechaCampana(campana.fechaInicio)}</dd></div><div><dt className="text-muted-foreground">Presupuesto total</dt><dd className="tnum mt-1 font-medium">{presupuestoCampana(campana.presupuesto)}</dd></div></dl>
              <div className="mt-auto pt-5"><Boton variante="ghost" className="min-h-11 w-full" onClick={() => setSeleccionada(campana)} aria-label={`Abrir ${campana.nombre}`}>{campana.estado === "borrador" ? "Continuar campaña" : campana.estado === "en_revision" ? "Revisar propuesta" : "Ver detalle"} →</Boton></div>
            </article>)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-muted-foreground">{datos.total} {datos.total === 1 ? "resultado" : "resultados"} · página {datos.page} de {Math.max(1, Math.ceil(datos.total / datos.limite))}</p><div className="flex gap-2"><Boton variante="ghost" className="min-h-11" disabled={filtros.page <= 1} onClick={() => filtrar({ page: filtros.page - 1 })}>Anterior</Boton><Boton variante="ghost" className="min-h-11" disabled={filtros.page * datos.limite >= datos.total} onClick={() => filtrar({ page: filtros.page + 1 })}>Siguiente</Boton></div></div>
        </> : <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border bg-card p-6 text-center"><div><span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-2xl text-primary" aria-hidden="true">＋</span><h3 className="text-lg font-semibold">{filtros.q || filtros.estado ? "No hay campañas con estos filtros" : esAds ? "Tu primera propuesta empieza aquí" : "Dale forma a tu primera campaña"}</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{filtros.q || filtros.estado ? "Prueba con otro nombre o vuelve a ver todas tus campañas." : "Solo necesitas un nombre y un objetivo para empezar. El resto lo puedes completar después."}</p><Boton className="mt-5 min-h-11" onClick={() => { if (filtros.q || filtros.estado) { setBusqueda(""); filtrar({ q: "", estado: "", page: 1 }); } else setEditor("nueva"); }}>{filtros.q || filtros.estado ? "Ver todas" : esAds ? "Crear primera propuesta" : "Crear primera campaña"}</Boton></div></div>}
      </section>
      {editor && <FormularioCampana tipo={tipo} campana={editor === "nueva" ? undefined : editor} onCerrar={() => setEditor(null)} onGuardada={guardada} onRecargada={(campana) => { setEditor(null); setSeleccionada(campana); setAviso("Mostrando la versión guardada más reciente."); refrescar(); }} />}
      {seleccionada && !editor && <DetalleCampana campana={seleccionada} esAdmin={esAdmin} onCerrar={() => setSeleccionada(null)} onEditar={() => setEditor(seleccionada)} onCambio={(campana) => { setSeleccionada(campana); setAviso("Campaña actualizada."); refrescar(); }} />}
    </main>
  );
}
