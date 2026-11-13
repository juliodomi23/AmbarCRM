"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Notificacion = {
  id: string;
  titulo: string;
  cuerpo: string | null;
  enlace: string | null;
  leidaAt: string | null;
  createdAt: string;
};

export function NotificacionesCampana() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const refrescar = async () => {
    const res = await fetch("/api/notificaciones");
    if (!res.ok) return;
    const data = await res.json();
    setNotificaciones(data.notificaciones ?? []);
    setNoLeidas(data.noLeidas ?? 0);
  };

  useEffect(() => {
    refrescar();
    const timer = window.setInterval(refrescar, 30000);
    window.addEventListener("focus", refrescar);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refrescar);
    };
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    window.addEventListener("mousedown", fuera);
    return () => window.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const abrir = async (n: Notificacion) => {
    if (!n.leidaAt) {
      setNotificaciones((prev) => prev.map((x) => (x.id === n.id ? { ...x, leidaAt: new Date().toISOString() } : x)));
      setNoLeidas((c) => Math.max(0, c - 1));
      fetch(`/api/notificaciones/${n.id}/leer`, { method: "POST" }).catch(() => {});
    }
    setAbierto(false);
    if (n.enlace) router.push(n.enlace);
  };

  const marcarTodas = async () => {
    setNotificaciones((prev) => prev.map((x) => ({ ...x, leidaAt: x.leidaAt ?? new Date().toISOString() })));
    setNoLeidas(0);
    fetch("/api/notificaciones", { method: "POST" }).catch(() => {});
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setAbierto((v) => !v); void refrescar(); }}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl hover:bg-card"
        aria-label="Notificaciones"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {noLeidas > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>
      {abierto && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-xl bg-card p-1 text-foreground shadow-pop">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-semibold">Notificaciones</span>
            {noLeidas > 0 && (
              <button onClick={marcarTodas} className="text-xs text-primary hover:underline">
                Marcar todas leídas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-auto">
            {notificaciones.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Sin notificaciones</p>
            )}
            {notificaciones.map((n) => (
              <button
                key={n.id}
                onClick={() => abrir(n)}
                className={[
                  "block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5",
                  n.leidaAt ? "opacity-60" : "",
                ].join(" ")}
              >
                <p className="font-medium">{n.titulo}</p>
                {n.cuerpo && <p className="mt-0.5 text-xs text-muted-foreground">{n.cuerpo}</p>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
