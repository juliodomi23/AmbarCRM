"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";

/** Borra un registro con confirmación en el mismo botón (sin diálogos del navegador). */
export function BotonEliminar({ endpoint, etiqueta = "Quitar" }: { endpoint: string; etiqueta?: string }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);

  async function borrar() {
    const res = await fetch(endpoint, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setConfirmar(false);
    if (!res.ok) return toast(data.error ?? "No se pudo borrar", "error");
    toast("Eliminado");
    router.refresh();
  }

  return confirmar ? (
    <span className="flex gap-2 text-xs">
      <button type="button" onClick={borrar} className="font-semibold text-red-600">¿Seguro? Sí</button>
      <button type="button" onClick={() => setConfirmar(false)} className="text-muted-foreground">No</button>
    </span>
  ) : (
    <button type="button" onClick={() => setConfirmar(true)} className="text-xs font-medium text-red-600 hover:underline">
      {etiqueta}
    </button>
  );
}
