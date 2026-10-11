"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmar } from "@/components/Confirmador";
import { toast } from "@/components/Toaster";

/** Borra un registro tras pedir confirmación con el diálogo de la app. */
export function BotonEliminar({
  endpoint,
  etiqueta = "Quitar",
  titulo,
  mensaje = "Esta acción no se puede deshacer."
}: {
  endpoint: string;
  etiqueta?: string;
  titulo?: string;
  mensaje?: string;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function borrar() {
    const ok = await confirmar({ titulo: titulo ?? etiqueta, mensaje, confirmar: etiqueta });
    if (!ok) return;
    setOcupado(true);
    const res = await fetch(endpoint, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setOcupado(false);
    if (!res.ok) return toast(data.error ?? "No se pudo borrar", "error");
    toast("Eliminado");
    router.refresh();
  }

  return (
    <button type="button" onClick={borrar} disabled={ocupado} className="text-xs font-medium text-destructive hover:underline disabled:opacity-60">
      {etiqueta}
    </button>
  );
}
