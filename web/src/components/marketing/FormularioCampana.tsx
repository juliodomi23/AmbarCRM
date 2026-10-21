"use client";

import { useRef, useState } from "react";
import { Boton, Campo, CLASE_CAMPO, Selector } from "@/components/ui";
import type { CampanaMarketingDto, TipoCampana, ObjetivoCampana, CanalCampana } from "@/lib/marketing";
import { DialogoCampana } from "./DialogoCampana";
import { CANALES_UI, OBJETIVOS_UI, endpointCampanas, respuestaCampana } from "./presentacion";

const PASOS = ["Tu objetivo", "Público y mensaje", "Fechas y presupuesto"];

export function FormularioCampana({ tipo, campana, onCerrar, onGuardada, onRecargada }: {
  tipo: TipoCampana; campana?: CampanaMarketingDto; onCerrar: () => void; onGuardada: (campana: CampanaMarketingDto) => void; onRecargada: (campana: CampanaMarketingDto) => void;
}) {
  const esAds = tipo === "meta_ads";
  const [paso, setPaso] = useState(0);
  const [datos, setDatos] = useState({
    nombre: campana?.nombre ?? "", objetivo: campana?.objetivo ?? "mensajes" as ObjetivoCampana,
    canal: campana?.canal ?? (esAds ? "facebook_instagram" : "whatsapp") as CanalCampana,
    audiencia: campana?.audiencia ?? "", contenido: campana?.contenido ?? "",
    fechaInicio: campana?.fechaInicio ?? "", fechaFin: campana?.fechaFin ?? "", presupuesto: campana?.presupuesto ?? "",
  });
  const [modificado, setModificado] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [conflicto, setConflicto] = useState(false);
  const [ultima, setUltima] = useState<CampanaMarketingDto | null>(null);
  const [recargando, setRecargando] = useState(false);
  const tituloPaso = useRef<HTMLHeadingElement>(null);
  const formulario = useRef<HTMLFormElement>(null);
  function cambiar<K extends keyof typeof datos>(campo: K, valor: typeof datos[K]) {
    setDatos((actual) => ({ ...actual, [campo]: valor }));
    setModificado(true);
    setError("");
  }
  function irPaso(siguiente: number) {
    if (siguiente > paso && !formulario.current?.reportValidity()) return;
    setPaso(siguiente);
    requestAnimationFrame(() => tituloPaso.current?.focus());
  }
  function cerrar() {
    if (guardando) return;
    if (modificado) setConfirmarSalida(true);
    else onCerrar();
  }
  async function verVersionActual() {
    if (!campana) return;
    setRecargando(true);
    try {
      const resultado = await respuestaCampana<{ campana: CampanaMarketingDto }>(await fetch(`${endpointCampanas(tipo)}/${campana.id}`, { cache: "no-store" }));
      setUltima(resultado.campana);
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos cargar la versión actual."); }
    finally { setRecargando(false); }
  }
  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (guardando) return;
    if (!datos.nombre.trim()) { setPaso(0); setError("Ponle un nombre a tu campaña para guardar el borrador."); return; }
    setGuardando(true); setError("");
    try {
      const respuesta = await fetch(`${endpointCampanas(tipo)}${campana ? `/${campana.id}` : ""}`, {
        method: campana ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...datos, fechaInicio: datos.fechaInicio || null, fechaFin: datos.fechaFin || null, presupuesto: datos.presupuesto || null, ...(campana ? { version: campana.version } : {}) }),
      });
      if (respuesta.status === 409) setConflicto(true);
      const resultado = await respuestaCampana<{ campana: CampanaMarketingDto }>(respuesta);
      onGuardada(resultado.campana);
    } catch (e) { setError(e instanceof Error ? e.message : "No se guardó. Tus cambios siguen aquí para volver a intentar."); }
    finally { setGuardando(false); }
  }
  return (
    <DialogoCampana titulo={campana ? "Editar borrador" : esAds ? "Nueva propuesta de anuncio" : "Nueva campaña"}
      subtitulo="Empieza con una idea. Puedes guardar el borrador y completarlo después." onCerrar={cerrar}>
      <form ref={formulario} onSubmit={guardar}>
        <ol aria-label="Pasos para preparar la campaña" className="grid grid-cols-3 gap-2 border-b border-border bg-muted/30 p-4 sm:px-6">
          {PASOS.map((nombre, indice) => <li key={nombre} aria-current={paso === indice ? "step" : undefined} className={`flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:gap-2 ${paso === indice ? "font-semibold text-primary" : "text-muted-foreground"}`}>
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${paso === indice ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{indice + 1}</span>{nombre}
          </li>)}
        </ol>
        <fieldset disabled={guardando} className="min-w-0 space-y-5 p-4 sm:p-6">
          {confirmarSalida && <div role="alert" className="space-y-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
            <p className="text-sm font-medium">Tienes cambios sin guardar. ¿Quieres salir y descartarlos?</p>
            <div className="flex flex-wrap gap-2"><Boton type="button" variante="ghost" onClick={() => setConfirmarSalida(false)}>Seguir editando</Boton><Boton type="button" variante="danger" onClick={onCerrar}>Descartar cambios</Boton></div>
          </div>}
          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {conflicto && <section className="space-y-3 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
            <p>Tus cambios siguen en este formulario. Revisa la versión guardada antes de decidir si quieres descartarlos.</p>
            <Boton type="button" variante="ghost" disabled={recargando} onClick={verVersionActual}>{recargando ? "Cargando…" : "Comparar con la versión guardada"}</Boton>
            {ultima && <><div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-border bg-card p-3"><p className="font-semibold">Versión guardada {ultima.version}: {ultima.nombre}</p><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{ultima.contenido || "Sin mensaje"}</p></div><Boton type="button" variante="ghost" onClick={() => onRecargada(ultima)}>Descartar mis cambios y ver la versión actual</Boton></>}
          </section>}
          <h3 ref={tituloPaso} tabIndex={-1} className="text-xl font-semibold outline-none">{PASOS[paso]}</h3>
          {paso === 0 && <div className="space-y-5">
            <Campo label="Nombre de la campaña" placeholder={esAds ? "Ej. Anuncio de la promoción de noviembre" : "Ej. Promoción para clientes frecuentes"} value={datos.nombre} maxLength={120} required onChange={(e) => cambiar("nombre", e.target.value)} />
            <fieldset><legend className="mb-2 text-sm font-medium">¿Qué quieres conseguir?</legend>
              <div className="grid gap-3 sm:grid-cols-2">{Object.entries(OBJETIVOS_UI).map(([clave, objetivo]) => (
                <label key={clave} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${datos.objetivo === clave ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:bg-muted/40"}`}>
                  <input type="radio" name="objetivo" value={clave} checked={datos.objetivo === clave} onChange={() => cambiar("objetivo", clave as ObjetivoCampana)} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
                  <span><span className="block text-sm font-semibold">{objetivo.nombre}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{objetivo.ayuda}</span></span>
                </label>))}</div>
            </fieldset>
            {esAds ? <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Propuesta para Facebook e Instagram. Podrás definir las ubicaciones al integrar tu cuenta publicitaria.</p> :
              <Selector label="¿Dónde la vas a compartir?" value={datos.canal} onChange={(e) => cambiar("canal", e.target.value as CanalCampana)}>{Object.entries(CANALES_UI).filter(([clave]) => clave !== "facebook_instagram").map(([clave, nombre]) => <option key={clave} value={clave}>{nombre}</option>)}</Selector>}
          </div>}
          {paso === 1 && <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
            <div className="space-y-4">
              <label className="block space-y-1"><span className="text-sm font-medium">¿A quién quieres llegar?</span><textarea className={CLASE_CAMPO} rows={3} maxLength={2000} value={datos.audiencia} onChange={(e) => cambiar("audiencia", e.target.value)} placeholder="Ej. Personas de mi ciudad que buscan un regalo para su familia." /><span className="block text-xs text-muted-foreground">Describe a tu público. Esto todavía no crea una audiencia en Meta.</span></label>
              <label className="block space-y-1"><span className="text-sm font-medium">¿Qué les vas a decir?</span><textarea className={CLASE_CAMPO} rows={7} maxLength={10000} value={datos.contenido} onChange={(e) => cambiar("contenido", e.target.value)} placeholder="Cuenta el beneficio, agrega tu oferta e invita a dar el siguiente paso." /><span className="block text-xs text-muted-foreground">{datos.contenido.length.toLocaleString("es-MX")} / 10,000 caracteres</span></label>
            </div>
            <aside className="self-start rounded-xl border border-border bg-muted/30 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vista previa del texto</p><div className="mt-3 min-h-40 whitespace-pre-wrap break-words rounded-xl bg-card p-4 text-sm leading-relaxed [overflow-wrap:anywhere]">{datos.contenido || "Aquí aparecerá tu mensaje mientras lo escribes."}</div><p className="mt-3 text-xs text-muted-foreground">La imagen y el formato final del anuncio se prepararán en una siguiente etapa.</p></aside>
          </div>}
          {paso === 2 && <div className="space-y-5">
            <p className="text-sm text-muted-foreground">Estas fechas organizan tu plan. No programan publicaciones ni envíos automáticos.</p>
            <div className="grid gap-4 sm:grid-cols-2"><Campo label="Fecha de inicio" type="date" value={datos.fechaInicio} onChange={(e) => cambiar("fechaInicio", e.target.value)} /><Campo label="Fecha de fin" type="date" min={datos.fechaInicio || undefined} value={datos.fechaFin} onChange={(e) => cambiar("fechaFin", e.target.value)} /></div>
            <div className="max-w-sm"><Campo label={`Presupuesto total propuesto (MXN)${esAds ? "" : " · opcional"}`} type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" placeholder="Ej. 1500.00" value={datos.presupuesto} onChange={(e) => cambiar("presupuesto", e.target.value)} /><p className="mt-2 text-xs text-muted-foreground">Es el total para toda la campaña, no un importe diario. Guardarlo o aprobarlo no genera cargos.</p></div>
            <div className="rounded-xl border border-info/20 bg-info/5 p-4 text-sm"><p className="font-semibold">Después de guardar</p><p className="mt-1 text-muted-foreground">Revisa el resumen y envíalo a aprobación cuando esté completo. Un administrador podrá aprobar el plan.</p></div>
          </div>}
        </fieldset>
        <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card p-4 sm:px-6">
          <div>{paso > 0 && <Boton type="button" variante="ghost" className="min-h-11" onClick={() => irPaso(paso - 1)} disabled={guardando}>← Atrás</Boton>}</div>
          <div className="flex flex-wrap gap-2"><Boton type="submit" variante={paso === 2 ? "primary" : "ghost"} className="min-h-11" disabled={guardando || conflicto}>{guardando ? "Guardando…" : "Guardar borrador"}</Boton>{paso < 2 && <Boton type="button" className="min-h-11" onClick={() => irPaso(paso + 1)} disabled={guardando}>Continuar →</Boton>}</div>
        </footer>
      </form>
    </DialogoCampana>
  );
}
