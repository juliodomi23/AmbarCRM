"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EmbeddedSignup } from "@/components/config/EmbeddedSignup";
import { Boton, Campo } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { errorDePlantilla, variablesDePlantilla } from "@/lib/meta/plantillaMeta";

type Canal = {
  id: string;
  nombre: string;
  telefono?: string | null;
  estado: string;
  wabaId?: string | null;
  phoneNumberId?: string | null;
  credencialesConfiguradas?: boolean;
};

type PlantillaMeta = {
  name: string;
  language: string;
  status?: string;
  category?: string;
};

const ESTADOS: Record<string, { label: string; clase: string }> = {
  PENDING: { label: "En revisión", clase: "bg-warning/15 text-warning" },
  APPROVED: { label: "Aprobada", clase: "bg-success/15 text-success" },
  REJECTED: { label: "Rechazada", clase: "bg-destructive/15 text-destructive" },
  PAUSED: { label: "Pausada", clase: "bg-muted text-muted-foreground" },
  DISABLED: { label: "Desactivada", clase: "bg-muted text-muted-foreground" }
};

// vista "canal": conexión y números · vista "plantillas": plantillas de Meta del número elegido.
export function MetaCanales({ canales, vista = "canal" }: { canales: Canal[]; vista?: "canal" | "plantillas" }) {
  const router = useRouter();
  const [canalId, setCanalId] = useState(canales[0]?.id || "");
  const canal = canales.find((item) => item.id === canalId) || canales[0];
  const [plantillas, setPlantillas] = useState<PlantillaMeta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({
    name: "",
    language: "es_MX",
    category: "UTILITY",
    body: ""
  });
  const [ejemplos, setEjemplos] = useState<string[]>([]);
  const variables = variablesDePlantilla(form.body);

  useEffect(() => {
    if (vista !== "plantillas" || !canal?.id) return setPlantillas([]);
    setCargando(true);
    fetch(`/api/meta/templates?canalId=${encodeURIComponent(canal.id)}`)
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "No se pudieron consultar las plantillas");
        setPlantillas(data.plantillas || []);
      })
      .catch((error) => toast(error.message, "error"))
      .finally(() => setCargando(false));
  }, [canal?.id, vista]);

  async function crearPlantilla(event: React.FormEvent) {
    event.preventDefault();
    if (!canal) return;
    const error = errorDePlantilla(form.body, ejemplos);
    if (error) return toast(error, "error");
    setEnviando(true);
    const response = await fetch("/api/meta/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canalId: canal.id, ...form, ejemplos: ejemplos.slice(0, variables.length) })
    });
    const data = await response.json().catch(() => ({}));
    setEnviando(false);
    if (!response.ok) return toast(data.error || "Meta rechazó la plantilla", "error");
    toast("Plantilla enviada a revisión de Meta", "ok");
    setForm({ ...form, name: "", body: "" });
    setEjemplos([]);
    setPlantillas((current) => [data.plantilla, ...current]);
  }

  async function activar() {
    if (!canal) return;
    const response = await fetch(`/api/canales/${canal.id}/registrar`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast(`Meta no activó el número: ${data.error || "error desconocido"}`, "error");
    toast("Número activado en WhatsApp. Ya puede recibir mensajes.", "ok");
    router.refresh();
  }

  async function desconectar() {
    if (!canal || !confirm(`¿Desconectar ${canal.nombre} de AmbarCRM?`)) return;
    const borrarDatos = confirm(
      "¿También quieres BORRAR las conversaciones de este número?\n\n" +
      "Aceptar = borrar los chats y sus mensajes (no se puede deshacer)\n" +
      "Cancelar = conservar el historial"
    );
    const response = await fetch(`/api/canales/${canal.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ borrarDatos })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast(data.error || "No se pudo desconectar", "error");
    toast(borrarDatos ? "Número desconectado y conversaciones borradas" : "Número desconectado; el historial se conservó", "ok");
    setCanalId("");
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-5">
      {vista === "canal" && <EmbeddedSignup />}

      {vista === "plantillas" && canales.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Conecta un número en la pestaña Canal WhatsApp para crear plantillas de Meta.
        </p>
      )}

      {vista === "plantillas" && canales.length > 1 && (
        <select
          value={canal?.id || ""}
          onChange={(event) => setCanalId(event.target.value)}
          className="max-w-64 rounded-lg border border-input px-3 py-2 text-sm"
        >
          {canales.map((item) => (
            <option key={item.id} value={item.id}>{item.nombre}</option>
          ))}
        </select>
      )}

      {vista === "canal" && canales.length > 0 && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">Números conectados</p>
              <p className="text-xs text-muted-foreground">Cada número se conecta directamente con Meta.</p>
            </div>
            <select
              value={canal?.id || ""}
              onChange={(event) => setCanalId(event.target.value)}
              className="max-w-64 rounded-lg border border-input px-3 py-2 text-sm"
            >
              {canales.map((item) => (
                <option key={item.id} value={item.id}>{item.nombre}</option>
              ))}
            </select>
          </div>
          {canal && (
            <div className="grid gap-2 rounded-lg bg-background p-3 text-sm sm:grid-cols-2">
              <p><span className="text-muted-foreground">Teléfono:</span> {canal.telefono || "—"}</p>
              <p><span className="text-muted-foreground">Estado:</span> {canal.estado}</p>
              <p><span className="text-muted-foreground">Phone Number ID:</span> {canal.phoneNumberId || "—"}</p>
              <p><span className="text-muted-foreground">Credencial:</span> {canal.credencialesConfiguradas ? "Protegida" : "Incompleta"}</p>
              <button type="button" onClick={activar} className="text-left text-xs font-medium text-primary hover:underline">
                Activar número (si no recibe mensajes)
              </button>
              <button type="button" onClick={desconectar} className="text-left text-xs text-red-600 hover:underline">
                Desconectar de AmbarCRM
              </button>
            </div>
          )}
        </section>
      )}

      {vista === "plantillas" && canal && (
        <section className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div>
            <p className="font-semibold text-foreground">Plantillas de Meta</p>
            <p className="text-xs text-muted-foreground">Crea y consulta plantillas sin salir del CRM.</p>
          </div>
          <form onSubmit={crearPlantilla} className="space-y-3 rounded-lg border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                label="Nombre interno"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                placeholder="seguimiento_cliente"
                required
              />
              <label className="block space-y-1">
                <span className="text-sm font-medium text-muted-foreground">Categoría</span>
                <select
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  className="w-full rounded-lg border border-input px-3 py-2 text-sm"
                >
                  <option value="UTILITY">Utilidad</option>
                  <option value="MARKETING">Marketing</option>
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-muted-foreground">Mensaje</span>
              <textarea
                value={form.body}
                onChange={(event) => setForm({ ...form, body: event.target.value })}
                rows={3}
                maxLength={1024}
                required
                className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="block text-xs text-muted-foreground">
                Usa {"{{1}}"}, {"{{2}}"}… para datos que cambian, como el nombre o la fecha. No empieces ni termines el mensaje con una variable.
              </span>
            </label>
            {variables.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {variables.map((n) => (
                  <Campo
                    key={n}
                    label={`Ejemplo para {{${n}}}`}
                    value={ejemplos[n - 1] || ""}
                    onChange={(event) => {
                      const siguientes = [...ejemplos];
                      siguientes[n - 1] = event.target.value;
                      setEjemplos(siguientes);
                    }}
                    placeholder={n === 1 ? "Ana" : "lunes 10 a las 4 pm"}
                    required
                  />
                ))}
              </div>
            )}
            <Boton type="submit" disabled={enviando}>{enviando ? "Enviando…" : "Crear plantilla en Meta"}</Boton>
          </form>

          <div className="divide-y divide-border rounded-lg border border-border">
            {plantillas.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">{cargando ? "Cargando plantillas…" : "No hay plantillas oficiales."}</p>
            )}
            {plantillas.map((item) => (
              <div key={`${item.name}-${item.language}`} className="flex items-center gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1 font-medium text-foreground">{item.name}</span>
                <span className="text-xs text-muted-foreground">{item.language}</span>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${(ESTADOS[item.status || "PENDING"] ?? ESTADOS.PENDING).clase}`}>
                  {(ESTADOS[item.status || "PENDING"] ?? { label: item.status }).label}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
