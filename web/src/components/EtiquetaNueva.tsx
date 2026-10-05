"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";

const COLORES = ["#B45309", "#16A34A", "#3B82F6", "#8B5CF6", "#DC2626", "#64748B"];

/** Botón "+ Nueva etiqueta": crea la etiqueta y refresca la página para que aparezca. */
export function EtiquetaNueva({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState(COLORES[0]);
  const [guardando, setGuardando] = useState(false);

  async function crear() {
    if (!nombre.trim()) return;
    setGuardando(true);
    const res = await fetch("/api/etiquetas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nombre.trim(), color })
    });
    setGuardando(false);
    if (res.ok) {
      setNombre("");
      setAbierto(false);
      toast(`Etiqueta "${nombre.trim()}" creada`);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      toast(d.error ?? "No se pudo crear la etiqueta", "error");
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className={`rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:border-navy hover:text-navy ${className}`}
      >
        + Nueva etiqueta
      </button>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <input
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") crear();
          if (e.key === "Escape") setAbierto(false);
        }}
        placeholder="Nombre (ej. Cliente VIP)"
        className="w-36 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-navy/30"
      />
      {COLORES.map((c) => (
        <button
          key={c}
          onClick={() => setColor(c)}
          aria-label={`Color ${c}`}
          className={`h-5 w-5 rounded-full ${color === c ? "ring-2 ring-navy ring-offset-1" : ""}`}
          style={{ background: c }}
        />
      ))}
      <button
        onClick={crear}
        disabled={guardando || !nombre.trim()}
        className="rounded-lg bg-navy px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        {guardando ? "…" : "Crear"}
      </button>
      <button onClick={() => setAbierto(false)} className="text-xs text-slate-400 hover:text-slate-600">
        Cancelar
      </button>
    </div>
  );
}
