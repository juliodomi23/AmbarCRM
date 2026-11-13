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

function haceCuanto(valor: string) {
  const ms = Date.now() - new Date(valor).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}

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
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl border border-border/60 bg-card text-foreground shadow-pop">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <span className="text-sm font-semibold">Notificaciones</span>
            {noLeidas > 0 && (
              <button onClick={marcarTodas} className="text-xs font-medium text-primary hover:underline">
                Marcar todas leídas
              </button>
            )}
          </div>
          <div className="max-h-96 divide-y divide-border/60 overflow-auto">
            {notificaciones.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sin notificaciones</p>
            )}
            {notificaciones.map((n) => (
              <button
                key={n.id}
                onClick={() => abrir(n)}
                className="flex w-full items-start gap-2.5 px-4 py-3 text-left transition hover:bg-muted/60"
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.leidaAt ? "bg-transparent" : "bg-primary"}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm leading-snug ${n.leidaAt ? "text-muted-foreground" : "font-semibold text-foreground"}`}>{n.titulo}</span>
                  {n.cuerpo && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{n.cuerpo}</span>}
                  <span className="mt-1 block text-[11px] text-muted-foreground/80">{haceCuanto(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
