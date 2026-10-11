"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; msg: string; tipo: "ok" | "error" };

// Cola global sin context: cualquier componente llama `toast(...)`, el <Toaster/> los pinta.
let emitir: ((t: Omit<Toast, "id">) => void) | null = null;

export function toast(msg: string, tipo: "ok" | "error" = "ok") {
  emitir?.({ msg, tipo });
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
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:left-auto">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tipo === "error" ? "alert" : "status"}
          className={`animate-toast pointer-events-auto max-w-xs rounded-lg px-4 py-2.5 text-sm shadow-pop ${t.tipo === "error" ? "bg-destructive text-white" : "bg-primary text-primary-foreground"}`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
