"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo } from "@/components/ui";
import { api } from "@/components/config/tabs/shared";

export function TabBots({ bots, canales }: { bots: any[]; canales: any[] }) {
  const router = useRouter();
  const [f, setF] = useState({ nombre: "", webhookUrl: "", canalId: "" });
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://crm.tudominio.com";

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!f.nombre.trim() || !f.webhookUrl.trim()) return;
    if (await api("/api/bots", "POST", { ...f, canalId: f.canalId || null })) {
      setF({ nombre: "", webhookUrl: "", canalId: "" });
      router.refresh();
    }
  }
  async function toggle(b: any) {
    if (await api(`/api/bots/${b.id}`, "PATCH", { activo: !b.activo }))
      router.refresh();
  }
  async function regenerar(b: any) {
    if (!confirm("¿Regenerar el token? El valor anterior dejará de funcionar."))
      return;
    if (await api(`/api/bots/${b.id}`, "PATCH", { regenerarToken: true }))
      router.refresh();
  }
  async function borrar(b: any) {
    if (!confirm(`¿Borrar el bot "${b.nombre}"?`)) return;
    if (await api(`/api/bots/${b.id}`, "DELETE")) router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-5">
      <form
        onSubmit={crear}
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
      >
        <Campo
          label="Nombre del bot"
          value={f.nombre}
          onChange={(e) => setF({ ...f, nombre: e.target.value })}
          required
        />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            Canal
          </span>
          <select
            value={f.canalId}
            onChange={(e) => setF({ ...f, canalId: e.target.value })}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm"
          >
            <option value="">Todos los canales</option>
            {canales.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2">
          <Campo
            label="Webhook URL (nodo Webhook de n8n)"
            value={f.webhookUrl}
            onChange={(e) => setF({ ...f, webhookUrl: e.target.value })}
            placeholder="https://n8n.tudominio.com/webhook/bot-x"
            required
          />
        </div>
        <div className="sm:col-span-2">
          <Boton type="submit">+ Crear bot</Boton>
        </div>
      </form>

      <div className="space-y-3">
        {bots.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sin bots configurados.
          </p>
        )}
        {bots.map((b) => (
          <div
            key={b.id}
            className="space-y-2 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">{b.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {b.canal?.nombre ?? "Todos los canales"}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <button
                  onClick={() => toggle(b)}
                  className={
                    b.activo ? "text-green-600" : "text-muted-foreground"
                  }
                >
                  {b.activo ? "● Activo" : "○ Inactivo"}
                </button>
                <button
                  onClick={() => borrar(b)}
                  className="text-red-600 hover:underline"
                >
                  Borrar
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-background p-3 text-xs">
              <p className="text-muted-foreground">Webhook (CRM → n8n):</p>
              <code className="block break-all text-foreground">
                {b.webhookUrl}
              </code>
            </div>

            <div className="rounded-lg bg-background p-3 text-xs">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground">
                  Token (header <code>api_access_token</code>):
                </p>
                <button
                  onClick={() => regenerar(b)}
                  className="text-primary hover:underline"
                >
                  Regenerar
                </button>
              </div>
              <code className="block break-all text-foreground">
                {b.apiToken}
              </code>
            </div>

            <div className="rounded-lg bg-background p-3 text-xs">
              <p className="text-muted-foreground">
                Endpoint para responder desde n8n:
              </p>
              <code className="block break-all text-foreground">
                POST {origin}
                /api/v1/accounts/1/conversations/&#123;&#123;conversationId&#125;&#125;/messages
              </code>
              <p className="mt-1 text-muted-foreground">
                Handoff (ceder a humano): manda la etiqueta{" "}
                <code>escalado_humano</code> a:
              </p>
              <code className="block break-all text-foreground">
                POST {origin}
                /api/v1/accounts/1/conversations/&#123;&#123;conversationId&#125;&#125;/labels
              </code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
