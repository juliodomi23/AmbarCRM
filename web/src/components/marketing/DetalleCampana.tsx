"use client";

import { useState } from "react";
import { Badge, Boton } from "@/components/ui";
import { faltantesRevision, type AccionCampana, type CampanaMarketingDto } from "@/lib/marketing";
import { DialogoCampana } from "./DialogoCampana";
import { CANALES_UI, ESTADOS_UI, OBJETIVOS_UI, endpointCampanas, fechaCampana, presupuestoCampana, respuestaCampana } from "./presentacion";

const ACCIONES: Record<AccionCampana, { nombre: string; mensaje: string }> = {
  enviar_revision: { nombre: "Enviar a revisión", mensaje: "El contenido quedará bloqueado para que un administrador revise esta versión. Puedes devolverla a borrador si necesitas cambiar algo." },
  aprobar: { nombre: "Aprobar plan", mensaje: "Confirmas el contenido, las fechas y el presupuesto propuesto. Esta aprobación es interna: no publica anuncios, envía mensajes ni genera cargos." },
  devolver_borrador: { nombre: "Volver a borrador", mensaje: "La campaña volverá a ser editable y necesitará una nueva revisión. Su aprobación anterior, si existe, dejará de ser válida." },
  archivar: { nombre: "Archivar", mensaje: "La campaña quedará guardada como referencia y ya no se podrá editar ni reabrir. Esto no cambia anuncios ni publicaciones externas." },
};

export function DetalleCampana({ campana, esAdmin, onCerrar, onEditar, onCambio }: {
  campana: CampanaMarketingDto; esAdmin: boolean; onCerrar: () => void; onEditar: () => void; onCambio: (campana: CampanaMarketingDto) => void;
}) {
  const [accion, setAccion] = useState<AccionCampana | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [recargando, setRecargando] = useState(false);
  const estado = ESTADOS_UI[campana.estado];
  const faltantes = faltantesRevision(campana);
  async function ejecutar() {
    if (!accion || ocupado) return;
    setOcupado(true); setError("");
    try {
      const resultado = await respuestaCampana<{ campana: CampanaMarketingDto }>(await fetch(`${endpointCampanas(campana.tipo)}/${campana.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion, version: campana.version }),
      }));
      setAccion(null); onCambio(resultado.campana);
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos guardar el cambio. Intenta de nuevo."); }
    finally { setOcupado(false); }
  }
  async function recargar() {
    setRecargando(true);
    try {
      const resultado = await respuestaCampana<{ campana: CampanaMarketingDto }>(await fetch(`${endpointCampanas(campana.tipo)}/${campana.id}`, { cache: "no-store" }));
      setError(""); setAccion(null); onCambio(resultado.campana);
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos recargar la campaña."); }
    finally { setRecargando(false); }
  }
  return (
    <DialogoCampana titulo={campana.nombre} subtitulo={campana.tipo === "meta_ads" ? "Propuesta de anuncio · Facebook e Instagram" : `Campaña de Marketing · ${CANALES_UI[campana.canal]}`} onCerrar={() => { if (!ocupado) onCerrar(); }}>
      <div className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><Badge tono={estado.tono} punto>{estado.nombre}</Badge><span className="text-xs text-muted-foreground">Versión {campana.version} · {estado.ayuda}</span></div>
        {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm"><p className="text-destructive">{error}</p><Boton type="button" variante="ghost" className="mt-2 min-h-10" disabled={recargando || ocupado} onClick={recargar}>{recargando ? "Actualizando…" : "Cargar versión más reciente"}</Boton></div>}
        <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <div className="min-w-0 space-y-5">
            <section><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objetivo</h3><p className="mt-1 font-medium">{OBJETIVOS_UI[campana.objetivo].nombre}</p></section>
            <section><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Público objetivo</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{campana.audiencia || "Aún por definir. Describe a quién quieres llegar."}</p></section>
            <section><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mensaje de la campaña</h3><p className="mt-2 min-h-28 whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/30 p-4 text-sm leading-relaxed [overflow-wrap:anywhere]">{campana.contenido || "Tu mensaje todavía está por escribir."}</p></section>
          </div>
          <aside className="space-y-4">
            <dl className="space-y-4 rounded-xl border border-border p-4 text-sm">
              <div><dt className="text-muted-foreground">Inicio previsto</dt><dd className="mt-1 font-medium">{fechaCampana(campana.fechaInicio)}</dd></div>
              <div><dt className="text-muted-foreground">Fin previsto</dt><dd className="mt-1 font-medium">{fechaCampana(campana.fechaFin)}</dd></div>
              <div><dt className="text-muted-foreground">Presupuesto total propuesto</dt><dd className="tnum mt-1 text-xl font-semibold">{presupuestoCampana(campana.presupuesto)}{campana.presupuesto !== null && <span className="ml-1 text-xs font-normal text-muted-foreground">MXN</span>}</dd></div>
            </dl>
            {campana.estado === "borrador" && <div className={`rounded-xl border p-4 ${faltantes.length ? "border-warning/20 bg-warning/5" : "border-success/20 bg-success/5"}`}>
              <h3 className="text-sm font-semibold">{faltantes.length ? "Para enviarla a revisión" : "Lista para revisión"}</h3>
              {faltantes.length ? <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{faltantes.map((campo) => <li key={campo}>○ {campo}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Ya completaste los datos necesarios. Tu equipo puede revisar el plan.</p>}
            </div>}
            {campana.aprobadaAt && <p className="text-xs text-muted-foreground">Aprobación interna registrada el {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(campana.aprobadaAt))}.</p>}
          </aside>
        </div>
        <p className="rounded-lg bg-info/5 p-3 text-sm text-muted-foreground">{campana.tipo === "meta_ads" ? "Esta propuesta se guarda en tu CRM. La conexión a Meta y la publicación de anuncios aún no están disponibles." : "Este plan se guarda en tu CRM. Los mensajes y las publicaciones se realizan por separado."}</p>
        {accion && <section role="alert" className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4"><h3 className="font-semibold">{ACCIONES[accion].nombre}</h3><p className="text-sm text-muted-foreground">{ACCIONES[accion].mensaje}</p><div className="flex flex-wrap gap-2"><Boton type="button" className="min-h-11" onClick={ejecutar} disabled={ocupado}>{ocupado ? "Guardando…" : "Confirmar"}</Boton><Boton type="button" variante="ghost" className="min-h-11" onClick={() => setAccion(null)} disabled={ocupado}>Cancelar</Boton></div></section>}
      </div>
      <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-border bg-card p-4 sm:px-6">
        {!accion && <>
          {campana.estado !== "archivada" && <Boton variante="ghost" className="min-h-11" onClick={() => setAccion("archivar")}>Archivar</Boton>}
          {campana.estado === "borrador" && <><Boton variante="ghost" className="min-h-11" onClick={onEditar}>Editar borrador</Boton><Boton className="min-h-11" disabled={faltantes.length > 0} onClick={() => setAccion("enviar_revision")}>Enviar a revisión</Boton></>}
          {(campana.estado === "en_revision" || (campana.estado === "aprobada" && esAdmin)) && <Boton variante="ghost" className="min-h-11" onClick={() => setAccion("devolver_borrador")}>Volver a borrador</Boton>}
          {campana.estado === "en_revision" && esAdmin && <Boton className="min-h-11" onClick={() => setAccion("aprobar")}>Aprobar plan</Boton>}
          {campana.estado === "en_revision" && !esAdmin && <p className="self-center text-sm text-muted-foreground">La aprobación la realiza un administrador.</p>}
          {campana.estado === "archivada" && <Boton variante="ghost" className="min-h-11" onClick={onCerrar}>Cerrar</Boton>}
        </>}
      </footer>
    </DialogoCampana>
  );
}
