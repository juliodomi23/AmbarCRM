"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; msg: string; tipo: "ok" | "error"; detalle?: string };

// Cola global sin context: cualquier componente llama `toast(...)`, el <Toaster/> los pinta.
let emitir: ((t: Omit<Toast, "id">) => void) | null = null;

export function toast(msg: string, tipo: "ok" | "error" = "ok", detalle?: string) {
  emitir?.({ msg, tipo, detalle });
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    emitir = (t) => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { ...t, id }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000);
    };
    return () => { emitir = null; };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tipo === "error" ? "alert" : "status"}
          className={`animate-toast pointer-events-auto max-w-xs rounded-lg px-4 py-2.5 text-sm shadow-pop ${t.detalle ? "self-center border border-success/40 bg-card text-success text-center" : t.tipo === "error" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}
        >
          {t.detalle ? <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1"><p className="font-semibold">{t.msg}</p><p className="mt-1 break-words">{t.detalle}</p></div>
            <button type="button" aria-label="Cerrar aviso" onClick={() => setItems((x) => x.filter((item) => item.id !== t.id))} className="shrink-0 text-lg leading-none">×</button>
          </div> : t.msg}
        </div>
      ))}
    </div>
  );
}
