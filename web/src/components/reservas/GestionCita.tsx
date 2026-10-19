"use client";

import { useEffect, useState } from "react";
import { ReprogramarCita, type CitaGestionPublica } from "./ReprogramarCita";

/** Gestión de la cita con su enlace personal. */
export function GestionCita({ token }: { token: string }) {
  const ruta = `/api/public/reservas/cita/${encodeURIComponent(token)}`;
  const [cita, setCita] = useState<CitaGestionPublica | null>(null);
  const [reprogramando, setReprogramando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    void fetch(ruta, { signal: abort.signal }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (abort.signal.aborted) return;
      if (res.ok) setCita(data);
      else setError(data.error ?? "Cita no encontrada");
    }).catch(() => { if (!abort.signal.aborted) setError("No se pudo cargar la cita. Revisa tu conexión."); });
    return () => abort.abort();
  }, [ruta, revision]);

  async function cancelar() {
    setGuardando(true);
    try {
    const res = await fetch(ruta, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "cancelar" }) });
    const data = await res.json().catch(() => ({}));
    setConfirmar(false);
    if (res.ok && cita) { setCita({ ...cita, estado: "cancelada", reprogramable: false }); setError(""); setMensaje("Tu cita quedó cancelada."); }
    else setError(data.error ?? "No se pudo cancelar");
    } catch { setError("No se pudo cancelar. Revisa tu conexión e intenta de nuevo."); }
    finally { setGuardando(false); }
  }

  const cancelable = cita && ["programada", "confirmada"].includes(cita.estado) && new Date(cita.inicio) > new Date();
  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-4 bg-background p-4 pt-10 text-center">
      <h1 className="text-xl font-bold">Tu cita</h1>
      {mensaje && <p role="status" className="rounded-lg border border-success/40 p-3 text-sm">{mensaje}</p>}
      {!cita && <p className="text-sm text-muted-foreground">{error || "Cargando…"}</p>}
      {cita && (
        <div className="space-y-2 surface p-4">
          <p className="font-medium">{cita.servicio}{cita.especialista ? ` con ${cita.especialista}` : ""}</p>
          <p className="first-letter:uppercase">
            {new Intl.DateTimeFormat("es-MX", { timeZone: cita.zona, dateStyle: "full", timeStyle: "short" }).format(new Date(cita.inicio))}
          </p>
          <p className="text-sm capitalize text-muted-foreground">Estado: {cita.estado.replaceAll("_", " ")}</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center justify-center gap-3">
          {cita.reprogramable && !confirmar && !reprogramando && <button type="button" onClick={() => { setMensaje(""); setError(""); setReprogramando(true); }} className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Cambiar fecha y hora</button>}
          {cancelable && !confirmar && !reprogramando && (
            <button type="button" onClick={() => setConfirmar(true)} className="min-h-11 px-3 text-sm font-medium text-destructive">Cancelar cita</button>
          )}
          {cancelable && confirmar && (
            <div className="flex justify-center gap-3 text-sm">
              <button type="button" disabled={guardando} onClick={cancelar} className="rounded-lg bg-destructive px-3 py-1.5 font-medium text-destructive-foreground">Sí, cancelar</button>
              <button type="button" onClick={() => setConfirmar(false)}>No</button>
            </div>
          )}
          </div>
        </div>
      )}
      {cita && reprogramando && <ReprogramarCita ruta={ruta} cita={cita} onClose={() => setReprogramando(false)} onRecargar={() => { setReprogramando(false); setRevision((n) => n + 1); }} onActualizada={(actualizada) => { setCita(actualizada); setReprogramando(false); setError(""); setMensaje("Tu cita quedó reprogramada. Guarda este mismo enlace para consultarla."); }} />}
    </main>
  );
}
