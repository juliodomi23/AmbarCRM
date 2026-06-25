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
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`max-w-xs rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${t.tipo === "error" ? "bg-red-600" : "bg-navy"}`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
