"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Boton } from "@/components/ui";
import { toast } from "@/components/Toaster";

const TONOS: Record<string, "neutral" | "warning" | "destructive" | "success"> = {
  planeacion: "neutral",
  en_proceso: "warning",
  con_observaciones: "destructive",
  concluida: "success",
};

export function AuditoriaFiscalEstado({
  id, estado, hallazgos, opciones,
}: {
  id: string;
  estado: string;
  hallazgos: string | null;
  opciones: { valor: string; etiqueta: string }[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(estado);
  const [nota, setNota] = useState(hallazgos ?? "");
  const [enviando, setEnviando] = useState(false);

  async function guardar() {
    setEnviando(true);
    const respuesta = await fetch(`/api/auditoria/fiscal/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: valor, hallazgos: nota }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    setEnviando(false);
    if (!respuesta.ok) { toast(datos.error ?? "No se pudo actualizar", "error"); return; }
    setEditando(false);
    router.refresh();
  }

  if (!editando) {
    return (
      <button type="button" onClick={() => setEditando(true)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <Badge tono={TONOS[estado] ?? "neutral"}>{opciones.find((o) => o.valor === estado)?.etiqueta ?? estado}</Badge>
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2 rounded-lg border border-input bg-card p-2 text-xs">
      <select className="w-full rounded-md border border-input bg-card px-2 py-1 text-xs" value={valor} onChange={(e) => setValor(e.target.value)}>
        {opciones.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
      </select>
      <textarea className="w-52 rounded-md border border-input bg-card px-2 py-1 text-xs" rows={2} placeholder="Hallazgos" value={nota} onChange={(e) => setNota(e.target.value)} />
      <div className="flex gap-1.5">
        <Boton className="min-h-8 px-2 text-xs" onClick={guardar} disabled={enviando}>{enviando ? "Guardando…" : "Guardar"}</Boton>
        <Boton variante="ghost" className="min-h-8 px-2 text-xs" onClick={() => setEditando(false)}>Cancelar</Boton>
      </div>
    </div>
  );
}
