"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui";
import { api } from "@/components/config/tabs/shared";

export function TabIA({ ajustes }: { ajustes: any }) {
  const router = useRouter();
  const [f, setF] = useState({
    nombreNegocio: ajustes?.nombreNegocio ?? "",
    iaPromptSistema: ajustes?.iaPromptSistema ?? "",
  });
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const ok = await api("/api/ajustes", "PATCH", f);
    setGuardando(false);
    if (ok) router.refresh();
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="rounded-xl border border-border bg-amber-50/60 p-3 text-xs text-muted-foreground">
        La IA usa el modelo <b>Claude Haiku</b> para sugerir respuestas.
        Configura el contexto de tu negocio aquí para que las sugerencias sean
        más precisas y con el tono correcto.
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">
            Nombre del negocio
          </span>
          <input
            value={f.nombreNegocio}
            onChange={(e) => setF({ ...f, nombreNegocio: e.target.value })}
            placeholder="Ej: Clínica Serénica, Pie Feliz Podología…"
            className={[
              "w-full rounded-lg border border-input px-3 py-2 text-sm",
              "outline-none focus:ring-2 focus:ring-primary/30",
            ].join(" ")}
          />
          <span className="text-xs text-muted-foreground">
            Se incluye en el contexto de la IA (&quot;Trabajas para X&quot;).
          </span>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">
            Instrucciones de la IA (prompt de sistema)
          </span>
          <textarea
            value={f.iaPromptSistema}
            onChange={(e) => setF({ ...f, iaPromptSistema: e.target.value })}
            rows={5}
            placeholder={
              "Eres un asistente de atención al cliente por WhatsApp. " +
              "Redacta la siguiente respuesta del agente: breve, cordial, en español neutro, lista para enviar. " +
              "Devuelve SOLO el texto, sin comillas ni explicaciones."
            }
            className={[
              "w-full rounded-lg border border-input px-3 py-2 text-sm",
              "outline-none focus:ring-2 focus:ring-primary/30",
            ].join(" ")}
          />
          <span className="text-xs text-muted-foreground">
            Si lo dejas vacío se usa el prompt por defecto. Personaliza el tono,
            la personalidad o las instrucciones del agente.
          </span>
        </label>

        <Boton onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Boton>
      </div>
    </div>
  );
}
