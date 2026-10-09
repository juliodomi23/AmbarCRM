"use client";

import { useEffect, useState } from "react";

type Cita = { servicio: string; inicio: string; estado: string; especialista: string | null; zona: string };

/** Página pública de una cita: consultarla y cancelarla sin cuenta, con el enlace que se le dio. */
export function GestionCita({ token }: { token: string }) {
  const ruta = `/api/public/reservas/cita/${encodeURIComponent(token)}`;
  const [cita, setCita] = useState<Cita | null>(null);
  const [error, setError] = useState("");
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    void fetch(ruta).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (res.ok) setCita(data);
      else setError(data.error ?? "Cita no encontrada");
    });
  }, [ruta]);

  async function cancelar() {
    const res = await fetch(ruta, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "cancelar" }) });
    const data = await res.json().catch(() => ({}));
    setConfirmar(false);
    if (res.ok && cita) setCita({ ...cita, estado: "cancelada" });
    else setError(data.error ?? "No se pudo cancelar");
  }

  const cancelable = cita && ["programada", "confirmada"].includes(cita.estado) && new Date(cita.inicio) > new Date();
  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-4 bg-background p-4 pt-10 text-center">
      <h1 className="text-xl font-bold">Tu cita</h1>
      {!cita && <p className="text-sm text-muted-foreground">{error || "Cargando…"}</p>}
      {cita && (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <p className="font-medium">{cita.servicio}{cita.especialista ? ` con ${cita.especialista}` : ""}</p>
          <p className="first-letter:uppercase">
            {new Intl.DateTimeFormat("es-MX", { timeZone: cita.zona, dateStyle: "full", timeStyle: "short" }).format(new Date(cita.inicio))}
          </p>
          <p className="text-sm capitalize text-muted-foreground">Estado: {cita.estado.replaceAll("_", " ")}</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {cancelable && !confirmar && (
            <button type="button" onClick={() => setConfirmar(true)} className="text-sm font-medium text-red-600">Cancelar cita</button>
          )}
          {cancelable && confirmar && (
            <div className="flex justify-center gap-3 text-sm">
              <button type="button" onClick={cancelar} className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white">Sí, cancelar</button>
              <button type="button" onClick={() => setConfirmar(false)}>No</button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
