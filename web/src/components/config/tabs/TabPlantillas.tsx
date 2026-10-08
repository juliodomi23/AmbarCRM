"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo } from "@/components/ui";
import { api } from "@/components/config/tabs/shared";

export function TabPlantillas({ plantillas }: { plantillas: any[] }) {
  const router = useRouter();
  const [f, setF] = useState({ nombre: "", contenido: "" });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (await api("/api/plantillas", "POST", f)) {
      setF({ nombre: "", contenido: "" });
      router.refresh();
    }
  }
  async function borrar(id: string) {
    if (await api(`/api/plantillas/${id}`, "DELETE")) router.refresh();
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={crear}
        className="space-y-3 rounded-xl border border-border bg-card p-4"
      >
        <Campo
          label="Nombre"
          value={f.nombre}
          onChange={(e) => setF({ ...f, nombre: e.target.value })}
          required
        />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            Contenido
          </span>
          <textarea
            value={f.contenido}
            onChange={(e) => setF({ ...f, contenido: e.target.value })}
            rows={3}
            required
            className={[
              "w-full rounded-lg border border-input px-3 py-2 text-sm",
              "outline-none focus:ring-2 focus:ring-primary/30",
            ].join(" ")}
          />
        </label>
        <Boton type="submit">+ Crear plantilla</Boton>
      </form>

      <div className="space-y-2">
        {plantillas.map((p) => (
          <div
            key={p.id}
            className="flex items-start justify-between rounded-xl border border-border bg-card p-3"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{p.nombre}</p>
              <p className="text-sm text-muted-foreground">{p.contenido}</p>
            </div>
            <button
              onClick={() => borrar(p.id)}
              className="text-xs text-red-600 hover:underline"
            >
              Borrar
            </button>
          </div>
        ))}
        {plantillas.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin plantillas.</p>
        )}
      </div>
    </div>
  );
}
