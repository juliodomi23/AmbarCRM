"use client";

import { useEffect, useRef, useState } from "react";

export type CitaGestionPublica = { servicio: string; inicio: string; estado: string; especialista: string | null; zona: string; reprogramable: boolean; confirmable: boolean };

export function ReprogramarCita({ ruta, cita, onActualizada, onClose, onRecargar }: {
  ruta: string;
  cita: CitaGestionPublica;
  onActualizada: (cita: CitaGestionPublica) => void;
  onClose: () => void;
  onRecargar: () => void;
}) {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: cita.zona }).format(new Date());
  const [desde, setDesde] = useState(hoy);
  const [dias, setDias] = useState<string[]>([]);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [fecha, setFecha] = useState("");
  const [horarios, setHorarios] = useState<string[]>([]);
  const [inicio, setInicio] = useState("");
  const [cargandoDias, setCargandoDias] = useState(true);
  const [cargandoHoras, setCargandoHoras] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const aviso = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) aviso.current?.focus(); }, [error]);

  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      setCargandoDias(true);
      try {
        const res = await fetch(`${ruta}?${new URLSearchParams({ desde })}`, { signal: abort.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudieron consultar los días");
        if (!abort.signal.aborted) { setDias(data.dias); setSiguiente(data.siguiente); }
      } catch (err) { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : "Revisa tu conexión"); }
      finally { if (!abort.signal.aborted) setCargandoDias(false); }
    })();
    return () => abort.abort();
  }, [ruta, desde]);

  useEffect(() => {
    if (!fecha) return;
    const abort = new AbortController();
    void (async () => {
      setCargandoHoras(true);
      setInicio("");
      setHorarios([]);
      try {
        const res = await fetch(`${ruta}?${new URLSearchParams({ fecha })}`, { signal: abort.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudieron consultar los horarios");
        if (!abort.signal.aborted) setHorarios(data.horarios.filter((h: string) => h !== cita.inicio));
      } catch (err) { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : "Revisa tu conexión"); }
      finally { if (!abort.signal.aborted) setCargandoHoras(false); }
    })();
    return () => abort.abort();
  }, [ruta, fecha, revision, cita.inicio]);

  const hora = (iso: string) => new Intl.DateTimeFormat("es-MX", { timeZone: cita.zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!inicio || guardando) return;
    setGuardando(true); setError("");
    try {
      const res = await fetch(ruta, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "reprogramar", inicio, inicioOriginal: cita.inicio }) });
      const data = await res.json();
      if (res.ok) { onActualizada(data.cita); return; }
      setError(data.error ?? "No se pudo reprogramar la cita");
      if (res.status === 409) setRevision((n) => n + 1);
    } catch { setError("No se pudo confirmar el cambio. Consulta tu cita antes de intentar de nuevo."); }
    finally { setGuardando(false); }
  }

  return <form onSubmit={guardar} className="space-y-4 surface p-4 text-left">
    <h2 className="font-semibold">Cambiar fecha y hora</h2>
    <p className="text-sm text-muted-foreground">Conservas el mismo servicio y especialista. Tu horario actual se mantiene hasta confirmar el cambio. Horarios en {cita.zona}.</p>
    {error && <div className="space-y-2"><p role="alert" tabIndex={-1} ref={aviso} className="text-sm text-destructive">{error}</p><button type="button" disabled={guardando} onClick={onRecargar} className="text-sm text-primary underline">Volver a consultar mi cita</button></div>}
    <fieldset disabled={guardando} className="space-y-3">
      <legend className="mb-2 text-sm font-medium">Elige otro día</legend>
      {cargandoDias ? <p role="status" className="text-sm">Consultando días…</p> : <>
        {!dias.length && <p className="text-sm text-muted-foreground">No hay días disponibles en este periodo.</p>}
        <div className="flex flex-wrap gap-2">{dias.map((dia) => <button type="button" key={dia} aria-pressed={fecha === dia} onClick={() => { setError(""); setFecha(dia); setInicio(""); }} className={`min-h-11 rounded-lg border px-3 py-2 text-sm ${fecha === dia ? "bg-primary text-primary-foreground" : "bg-card"}`}>
          {new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${dia}T12:00:00Z`))}
        </button>)}</div>
        <div className="flex justify-between gap-3 text-sm text-primary">
          {desde !== hoy && <button type="button" onClick={() => { setDesde(hoy); setFecha(""); setInicio(""); }}>Primeros días</button>}
          {siguiente && <button type="button" onClick={() => { setDesde(siguiente); setFecha(""); setInicio(""); }}>Ver más días</button>}
        </div>
      </>}
      {fecha && <div className="space-y-2"><p className="text-sm font-medium">Elige otra hora</p>
        {cargandoHoras ? <p role="status" className="text-sm">Consultando horarios…</p> : !horarios.length ? <p className="text-sm text-muted-foreground">No hay otro horario disponible ese día.</p> : <div className="grid grid-cols-3 gap-2">{horarios.map((h) => <button key={h} type="button" aria-pressed={inicio === h} onClick={() => setInicio(h)} className={`min-h-11 rounded-lg border p-2 text-sm ${inicio === h ? "bg-primary text-primary-foreground" : "bg-card"}`}>{hora(h)}</button>)}</div>}
      </div>}
    </fieldset>
    {inicio && <p className="text-sm font-medium">Nuevo horario: {new Intl.DateTimeFormat("es-MX", { timeZone: cita.zona, dateStyle: "long", timeStyle: "short" }).format(new Date(inicio))}</p>}
    <div className="flex flex-wrap gap-3">
      <button type="submit" disabled={!inicio || guardando || cargandoHoras || cargandoDias} className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{guardando ? "Guardando…" : "Confirmar cambio de horario"}</button>
      <button type="button" disabled={guardando} onClick={onClose} className="min-h-11 px-2 text-sm">Conservar horario actual</button>
    </div>
  </form>;
}
