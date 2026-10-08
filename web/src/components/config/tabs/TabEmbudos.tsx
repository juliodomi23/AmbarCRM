"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui";
import { api } from "@/components/config/tabs/shared";

export function TabEmbudos({ embudos }: { embudos: any[] }) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState("");
  const [etapaForm, setEtapaForm] = useState<
    Record<string, { nombre: string; tipo: string }>
  >({});

  async function crearEmbudo() {
    if (!nuevo.trim()) return;
    if (await api("/api/embudos", "POST", { nombre: nuevo })) {
      setNuevo("");
      router.refresh();
    }
  }
  async function borrarEmbudo(id: string) {
    if (!confirm("¿Borrar embudo y todas sus etapas/oportunidades?")) return;
    if (await api(`/api/embudos/${id}`, "DELETE")) router.refresh();
  }
  async function crearEtapa(embudoId: string) {
    const f = etapaForm[embudoId];
    if (!f?.nombre?.trim()) return;
    if (
      await api("/api/etapas", "POST", {
        embudoId,
        nombre: f.nombre,
        tipo: f.tipo || "normal",
      })
    ) {
      setEtapaForm((p) => ({
        ...p,
        [embudoId]: { nombre: "", tipo: "normal" },
      }));
      router.refresh();
    }
  }
  async function borrarEtapa(id: string) {
    if (await api(`/api/etapas/${id}`, "DELETE")) router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder="Nombre del embudo"
          className="rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
        <Boton onClick={crearEmbudo}>+ Embudo</Boton>
      </div>

      {embudos.map((e) => (
        <div key={e.id} className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{e.nombre}</h3>
            <button
              onClick={() => borrarEmbudo(e.id)}
              className="text-xs text-red-600 hover:underline"
            >
              Borrar embudo
            </button>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {e.etapas.map((et: any) => (
              <span
                key={et.id}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white"
                style={{ background: et.color }}
              >
                {et.nombre}
                <button
                  onClick={() => borrarEtapa(et.id)}
                  className="ml-1 opacity-80 hover:opacity-100"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={etapaForm[e.id]?.nombre ?? ""}
              onChange={(ev) =>
                setEtapaForm((p) => ({
                  ...p,
                  [e.id]: {
                    ...(p[e.id] ?? { tipo: "normal" }),
                    nombre: ev.target.value,
                  },
                }))
              }
              placeholder="Nueva etapa"
              className={[
                "rounded-lg border border-input px-3 py-1.5 text-sm",
                "outline-none focus:ring-2 focus:ring-primary/30",
              ].join(" ")}
            />
            <select
              value={etapaForm[e.id]?.tipo ?? "normal"}
              onChange={(ev) =>
                setEtapaForm((p) => ({
                  ...p,
                  [e.id]: {
                    ...(p[e.id] ?? { nombre: "" }),
                    tipo: ev.target.value,
                  },
                }))
              }
              className="rounded-lg border border-input px-2 py-1.5 text-sm"
            >
              <option value="normal">Normal</option>
              <option value="ganado">Ganado</option>
              <option value="perdido">Perdido</option>
            </select>
            <Boton variante="ghost" onClick={() => crearEtapa(e.id)}>
              + Etapa
            </Boton>
          </div>
        </div>
      ))}
    </div>
  );
}
