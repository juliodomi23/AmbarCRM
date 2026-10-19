"use client";

import { useState } from "react";

export function EnlaceCita({ citaId }: { citaId: string }) {
  const [enlace, setEnlace] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  return <section className="space-y-2 rounded-lg border border-border p-3 text-sm">
    <h3 className="font-medium">Enlace para el paciente</h3>
    <p className="text-xs text-muted-foreground">Permite consultar, confirmar asistencia y cancelar. Con servicio y especialista disponibles también puede cambiar de horario. Compártelo solo con el paciente.</p>
    {!enlace && <button type="button" disabled={cargando} className="min-h-11 font-medium text-primary" onClick={async () => {
      setCargando(true); setError("");
      try {
        const res = await fetch(`/api/citas/${citaId}/enlace`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudo obtener el enlace");
        if (data.demostracion) { setMensaje(data.mensaje); return; }
        setEnlace(data.enlace);
      } catch (err) { setError(err instanceof Error ? err.message : "No se pudo obtener el enlace. Revisa tu conexión."); }
      finally { setCargando(false); }
    }}>{cargando ? "Obteniendo…" : "Obtener enlace"}</button>}
    {enlace && <>
      <label className="block space-y-1"><span className="text-xs">Enlace personal de esta cita</span><input readOnly value={enlace} onFocus={(e) => e.target.select()} className="w-full rounded-lg border border-input bg-card p-2 text-xs" /></label>
      <button type="button" className="min-h-11 font-medium text-primary" onClick={async () => {
        try { await navigator.clipboard.writeText(enlace); setMensaje("Enlace copiado"); }
        catch { setMensaje("Selecciona y copia el enlace manualmente."); }
      }}>Copiar enlace</button>
    </>}
    {mensaje && <p role="status" className="text-xs text-muted-foreground">{mensaje}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
