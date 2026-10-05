"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo, Modal } from "@/components/ui";
import { IconoReloj } from "@/components/icons";

type Tarea = {
  id: string;
  titulo: string;
  descripcion: string | null;
  venceAt: string | null;
  completada: boolean;
  responsable: string | null;
  oportunidad: { id: string; titulo: string; contacto: string } | null;
};

function fecha(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function vencida(iso: string | null) {
  return iso ? new Date(iso) < new Date() : false;
}

function Grupo({ titulo, clase = "text-slate-600", children }: { titulo: string; clase?: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <h2 className={`mb-1 mt-4 text-sm font-semibold first:mt-0 ${clase}`}>{titulo}</h2>
      {children}
    </div>
  );
}

export function TareasCliente({
  tareas,
  usuarios
}: {
  tareas: Tarea[];
  usuarios: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ titulo: "", descripcion: "", venceAt: "", responsableId: "" });
  const [guardando, setGuardando] = useState(false);

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const res = await fetch("/api/tareas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, responsableId: form.responsableId || null })
    });
    setGuardando(false);
    if (res.ok) { setModal(false); setForm({ titulo: "", descripcion: "", venceAt: "", responsableId: "" }); router.refresh(); }
  }

  async function toggle(t: Tarea) {
    await fetch(`/api/tareas/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completada: !t.completada })
    });
    router.refresh();
  }

  async function borrar(t: Tarea) {
    if (!confirm("¿Borrar tarea?")) return;
    await fetch(`/api/tareas/${t.id}`, { method: "DELETE" });
    router.refresh();
  }

  const completadas = tareas.filter((t) => t.completada);
  const pendientes = tareas.filter((t) => !t.completada);

  // Agrupa las pendientes por urgencia.
  const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
  const finHoy = new Date(); finHoy.setHours(23, 59, 59, 999);
  const grupos = {
    vencidas: [] as Tarea[],
    hoy: [] as Tarea[],
    proximas: [] as Tarea[],
    sinFecha: [] as Tarea[]
  };
  for (const t of pendientes) {
    if (!t.venceAt) grupos.sinFecha.push(t);
    else {
      const v = new Date(t.venceAt);
      if (v < inicioHoy) grupos.vencidas.push(t);
      else if (v <= finHoy) grupos.hoy.push(t);
      else grupos.proximas.push(t);
    }
  }

  function Fila({ t }: { t: Tarea }) {
    return (
      <div className="flex items-start gap-3 border-b border-slate-100 py-3">
        <input type="checkbox" checked={t.completada} onChange={() => toggle(t)} className="mt-1 h-4 w-4 accent-navy" />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${t.completada ? "text-slate-400 line-through" : "text-slate-800"}`}>{t.titulo}</p>
          {t.descripcion && <p className="text-xs text-slate-500">{t.descripcion}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            {t.venceAt && (
              <span className={`flex items-center gap-1 ${vencida(t.venceAt) && !t.completada ? "font-medium text-red-600" : "text-slate-400"}`}>
                <IconoReloj className="h-3 w-3" /> {fecha(t.venceAt)}
              </span>
            )}
            {t.responsable && <span className="text-slate-400">· {t.responsable}</span>}
            {t.oportunidad && (
              <a href={`/oportunidades/${t.oportunidad.id}`} className="text-navy hover:underline">
                · {t.oportunidad.titulo} ({t.oportunidad.contacto})
              </a>
            )}
          </div>
        </div>
        <button onClick={() => borrar(t)} className="text-xs text-red-600 hover:underline">Borrar</button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Tareas</h1>
        <Boton onClick={() => setModal(true)}>+ Nueva tarea</Boton>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {pendientes.length === 0 && <p className="py-4 text-sm text-slate-400">Nada pendiente</p>}

        {grupos.vencidas.length > 0 && (
          <Grupo titulo={`Vencidas (${grupos.vencidas.length})`} clase="text-red-600">
            {grupos.vencidas.map((t) => <Fila key={t.id} t={t} />)}
          </Grupo>
        )}
        {grupos.hoy.length > 0 && (
          <Grupo titulo={`Hoy (${grupos.hoy.length})`} clase="text-amber-600">
            {grupos.hoy.map((t) => <Fila key={t.id} t={t} />)}
          </Grupo>
        )}
        {grupos.proximas.length > 0 && (
          <Grupo titulo={`Próximas (${grupos.proximas.length})`}>
            {grupos.proximas.map((t) => <Fila key={t.id} t={t} />)}
          </Grupo>
        )}
        {grupos.sinFecha.length > 0 && (
          <Grupo titulo={`Sin fecha (${grupos.sinFecha.length})`}>
            {grupos.sinFecha.map((t) => <Fila key={t.id} t={t} />)}
          </Grupo>
        )}

        {completadas.length > 0 && (
          <Grupo titulo={`Completadas (${completadas.length})`}>
            {completadas.map((t) => <Fila key={t.id} t={t} />)}
          </Grupo>
        )}
      </div>

      <Modal abierto={modal} onClose={() => setModal(false)} titulo="Nueva tarea">
        <form onSubmit={crear} className="space-y-3">
          <Campo label="Título" value={form.titulo} onChange={(e) => set("titulo", e.target.value)} required />
          <Campo label="Descripción" value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
          <Campo label="Vence" type="datetime-local" value={form.venceAt} onChange={(e) => set("venceAt", e.target.value)} />
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-600">Responsable</span>
            <select value={form.responsableId} onChange={(e) => set("responsableId", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30">
              <option value="">Yo</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Boton type="button" variante="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Crear"}</Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
