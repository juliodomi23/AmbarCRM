"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo, Modal } from "@/components/ui";

export function NuevaOportunidad({
  embudoId,
  etapas
}: {
  embudoId: string;
  etapas: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    valor: "",
    nombre: "",
    telefono: "",
    etapaId: etapas[0]?.id ?? ""
  });

  function set(campo: string, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const res = await fetch("/api/oportunidades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: form.titulo,
        valor: Number(form.valor) || 0,
        embudoId,
        etapaId: form.etapaId,
        contacto: { nombre: form.nombre, telefono: form.telefono || undefined }
      })
    });
    setGuardando(false);
    if (res.ok) {
      setAbierto(false);
      setForm({ titulo: "", valor: "", nombre: "", telefono: "", etapaId: etapas[0]?.id ?? "" });
      router.refresh();
    }
  }

  return (
    <>
      <Boton onClick={() => setAbierto(true)}>+ Nueva oportunidad</Boton>
      <Modal abierto={abierto} onClose={() => setAbierto(false)} titulo="Nueva oportunidad">
        <form onSubmit={guardar} className="space-y-3">
          <Campo label="Título" value={form.titulo} onChange={(e) => set("titulo", e.target.value)} required />
          <Campo label="Valor (MXN)" type="number" value={form.valor} onChange={(e) => set("valor", e.target.value)} />
          <Campo label="Nombre del contacto" value={form.nombre} onChange={(e) => set("nombre", e.target.value)} required />
          <Campo label="Teléfono (WhatsApp)" value={form.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="5219611234567" />
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-600">Etapa</span>
            <select
              value={form.etapaId}
              onChange={(e) => set("etapaId", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30"
            >
              {etapas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Boton type="button" variante="ghost" onClick={() => setAbierto(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Crear"}</Boton>
          </div>
        </form>
      </Modal>
    </>
  );
}
