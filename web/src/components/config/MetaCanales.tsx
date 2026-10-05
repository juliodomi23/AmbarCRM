"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EmbeddedSignup } from "@/components/config/EmbeddedSignup";
import { Boton, Campo } from "@/components/ui";
import { toast } from "@/components/Toaster";

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

export function MetaCanales({ canales }: { canales: Canal[] }) {
  const router = useRouter();
  const [canalId, setCanalId] = useState(canales[0]?.id || "");
  const canal = canales.find((item) => item.id === canalId) || canales[0];
  const [plantillas, setPlantillas] = useState<PlantillaMeta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [form, setForm] = useState({
    name: "",
    language: "es_MX",
    category: "UTILITY",
    body: ""
  });

  useEffect(() => {
    if (!canal?.id) return setPlantillas([]);
    setCargando(true);
    fetch(`/api/meta/templates?canalId=${encodeURIComponent(canal.id)}`)
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "No se pudieron consultar las plantillas");
        setPlantillas(data.plantillas || []);
      })
      .catch((error) => toast(error.message, "error"))
      .finally(() => setCargando(false));
  }, [canal?.id]);

  async function crearPlantilla(event: React.FormEvent) {
    event.preventDefault();
    if (!canal) return;
    setCargando(true);
    const response = await fetch("/api/meta/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canalId: canal.id, ...form })
    });
    const data = await response.json().catch(() => ({}));
    setCargando(false);
    if (!response.ok) return toast(data.error || "Meta rechazó la plantilla", "error");
    toast("Plantilla enviada a revisión de Meta", "ok");
    setForm({ ...form, name: "", body: "" });
    setPlantillas((current) => [data.plantilla, ...current]);
  }

  async function desconectar() {
    if (!canal || !confirm(`¿Desconectar ${canal.nombre} de AmbarCRM? El historial se conservará.`)) return;
    const response = await fetch(`/api/canales/${canal.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ borrarDatos: false })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast(data.error || "No se pudo desconectar", "error");
    toast("Canal desconectado; el historial se conservó", "ok");
    setCanalId("");
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-5">
      <EmbeddedSignup />

      {canales.length > 0 && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800">Números conectados</p>
              <p className="text-xs text-slate-500">Cada número se conecta directamente con Meta.</p>
            </div>
            <select
              value={canal?.id || ""}
              onChange={(event) => setCanalId(event.target.value)}
              className="max-w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {canales.map((item) => (
                <option key={item.id} value={item.id}>{item.nombre}</option>
              ))}
            </select>
          </div>
          {canal && (
            <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
              <p><span className="text-slate-500">Teléfono:</span> {canal.telefono || "—"}</p>
              <p><span className="text-slate-500">Estado:</span> {canal.estado}</p>
              <p><span className="text-slate-500">Phone Number ID:</span> {canal.phoneNumberId || "—"}</p>
              <p><span className="text-slate-500">Credencial:</span> {canal.credencialesConfiguradas ? "Protegida" : "Incompleta"}</p>
              <button type="button" onClick={desconectar} className="text-left text-xs text-red-600 hover:underline">
                Desconectar de AmbarCRM
              </button>
            </div>
          )}
        </section>
      )}

      {canal && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <p className="font-semibold text-slate-800">Plantillas oficiales de Meta</p>
            <p className="text-xs text-slate-500">Crea y consulta plantillas sin salir del CRM.</p>
          </div>
          <form onSubmit={crearPlantilla} className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                label="Nombre interno"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                placeholder="seguimiento_cliente"
                required
              />
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-600">Categoría</span>
                <select
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="UTILITY">Utilidad</option>
                  <option value="MARKETING">Marketing</option>
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-600">Mensaje</span>
              <textarea
                value={form.body}
                onChange={(event) => setForm({ ...form, body: event.target.value })}
                rows={3}
                maxLength={1024}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30"
              />
            </label>
            <Boton type="submit" disabled={cargando}>{cargando ? "Enviando…" : "Crear plantilla en Meta"}</Boton>
          </form>

          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {plantillas.length === 0 && (
              <p className="p-3 text-sm text-slate-500">{cargando ? "Consultando…" : "No hay plantillas oficiales."}</p>
            )}
            {plantillas.map((item) => (
              <div key={`${item.name}-${item.language}`} className="flex items-center gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1 font-medium text-slate-700">{item.name}</span>
                <span className="text-xs text-slate-500">{item.language}</span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.status || "PENDING"}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
