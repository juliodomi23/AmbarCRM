"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Modal, CLASE_CAMPO } from "@/components/ui";
import { toast } from "@/components/Toaster";

export function AccionCobro({ id, accion, cliente, concepto, monto }: {
  id: string; accion: "cancelar" | "eliminar"; cliente: string; concepto: string; monto: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [nota, setNota] = useState("");
  const eliminar = accion === "eliminar";
  const titulo = eliminar ? "Eliminar cobro" : "Cancelar cobro";

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!eliminar && !nota.trim()) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/cobros/${id}`, eliminar ? { method: "DELETE" } : {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "cancelado", nota: nota.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error ?? `No se pudo ${accion} el cobro`, "error");
        return;
      }
      toast(eliminar ? "Cobro eliminado" : "Cobro cancelado");
      setAbierto(false);
      router.refresh();
    } catch { toast(`No se pudo conectar. Reintenta ${accion} el cobro.`, "error"); }
    finally { setEnviando(false); }
  }

  return <>
    <Boton variante="ghost" className="min-h-11" onClick={() => { setNota(""); setAbierto(true); }}>{eliminar ? "Eliminar" : "Cancelar"}</Boton>
    <Modal abierto={abierto} onClose={() => !enviando && setAbierto(false)} titulo={titulo}>
      <form onSubmit={confirmar} className="space-y-4">
        <p className="break-words text-sm"><strong>{cliente}</strong> · {concepto} · <strong>${monto} MXN</strong></p>
        <p className="text-sm text-muted-foreground">{eliminar
          ? "Confirma la eliminación definitiva de este cobro cancelado y su historial de pagos."
          : "Confirma la cancelación. Los pagos se conservarán como registro y dejarán de contar en ingresos, cartera y comisiones."}</p>
        {!eliminar && <label className="block space-y-1"><span className="text-sm">Motivo (obligatorio)</span><textarea required rows={3} className={CLASE_CAMPO} value={nota} onChange={e => setNota(e.target.value)} /></label>}
        <div className="flex flex-wrap justify-end gap-2">
          <Boton type="button" variante="ghost" className="min-h-11" disabled={enviando} onClick={() => setAbierto(false)}>Volver</Boton>
          <Boton variante="danger" className="min-h-11" disabled={enviando || (!eliminar && !nota.trim())}>{enviando ? "Guardando…" : `Confirmar ${eliminar ? "eliminación" : "cancelación"}`}</Boton>
        </div>
      </form>
    </Modal>
  </>;
}
