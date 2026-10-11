"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Boton, Campo, Modal } from "@/components/ui";
import { IconoCheck, IconoCerrar, IconoReloj } from "@/components/icons";
import { EmptyState } from "@/components/EmptyState";

type Tarea = {
  id: string;
  titulo: string;
  descripcion: string | null;
  venceAt: string | null;
  completada: boolean;
  responsable: string | null;
  oportunidad: { id: string; titulo: string; contacto: string } | null;
};

type Tono = "vencida" | "hoy" | "proxima" | "neutra" | "hecha";

const TONOS: Record<Tono, { punto: string; chip: string }> = {
  vencida: { punto: "bg-destructive", chip: "bg-destructive/10 text-destructive" },
  hoy: { punto: "bg-warning", chip: "bg-warning/15 text-warning" },
  proxima: { punto: "bg-info", chip: "bg-info/10 text-info" },
  neutra: { punto: "bg-muted-foreground/40", chip: "bg-muted text-muted-foreground" },
  hecha: { punto: "bg-success", chip: "bg-muted text-muted-foreground" }
};

const DIA = 86_400_000;
const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Hoy, 4:00 p.m.", "Mañana, 9:00 a.m.", "Hace 3 días", "jue, 9:00 a.m." o "12 nov". */
function cuando(iso: string) {
  const fecha = new Date(iso);
  const dias = Math.round((inicioDelDia(fecha) - inicioDelDia(new Date())) / DIA);
  const hora = fecha.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
  if (dias === 0) return `Hoy, ${hora}`;
  if (dias === 1) return `Mañana, ${hora}`;
  if (dias === -1) return `Ayer, ${hora}`;
  if (dias < 0) return `Hace ${-dias} días`;
  if (dias < 7) return `${fecha.toLocaleDateString("es-MX", { weekday: "short" })}, ${hora}`;
  return fecha.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

const iniciales = (nombre: string) =>
  (nombre.match(/\p{L}+/gu) ?? []).slice(0, 2).map((p) => p[0].toUpperCase()).join("");

export function TareasCliente({
  tareas,
  usuarios
}: {
  tareas: Tarea[];
  usuarios: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [modal, setModal] = useState(params.get("nueva") === "1");
  const [form, setForm] = useState({ titulo: "", descripcion: "", venceAt: "", responsableId: "" });
  const [guardando, setGuardando] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [verCompletadas, setVerCompletadas] = useState(false);

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
    setOcupada(t.id);
    await fetch(`/api/tareas/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completada: !t.completada })
    });
    router.refresh();
    setOcupada(null);
  }

  async function borrar(t: Tarea) {
    if (!confirm(`¿Borrar la tarea "${t.titulo}"?`)) return;
    setOcupada(t.id);
    await fetch(`/api/tareas/${t.id}`, { method: "DELETE" });
    router.refresh();
    setOcupada(null);
  }

  const completadas = tareas.filter((t) => t.completada);
  const pendientes = tareas.filter((t) => !t.completada);

  // Agrupa las pendientes por urgencia.
  const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
  const finHoy = new Date(); finHoy.setHours(23, 59, 59, 999);
  const grupos = { vencidas: [] as Tarea[], hoy: [] as Tarea[], proximas: [] as Tarea[], sinFecha: [] as Tarea[] };
  for (const t of pendientes) {
    if (!t.venceAt) grupos.sinFecha.push(t);
    else {
      const v = new Date(t.venceAt);
      if (v < inicioHoy) grupos.vencidas.push(t);
      else if (v <= finHoy) grupos.hoy.push(t);
      else grupos.proximas.push(t);
    }
  }
  const tonoDe = (t: Tarea): Tono => {
    if (t.completada) return "hecha";
    if (!t.venceAt) return "neutra";
    const v = new Date(t.venceAt);
    return v < new Date() ? "vencida" : v <= finHoy ? "hoy" : "proxima";
  };

  function fila(t: Tarea) {
    const tono = TONOS[tonoDe(t)];
    return (
      <li key={t.id} className={`group flex items-start gap-3 px-4 py-3 transition hover:bg-muted/40 ${ocupada === t.id ? "opacity-50" : ""}`}>
        <button
          type="button"
          onClick={() => toggle(t)}
          disabled={ocupada === t.id}
          aria-pressed={t.completada}
          aria-label={t.completada ? `Marcar "${t.titulo}" como pendiente` : `Completar "${t.titulo}"`}
          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition ${
            t.completada ? "border-success bg-success text-white" : "border-muted-foreground/40 text-transparent hover:border-success hover:text-success/60"
          }`}
        >
          <IconoCheck className="h-3 w-3" />
        </button>

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium leading-snug ${t.completada ? "text-muted-foreground line-through" : "text-foreground"}`}>
            {t.titulo}
          </p>
          {t.descripcion && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.descripcion}</p>}
          {(t.venceAt || t.responsable || t.oportunidad) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              {t.venceAt && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${tono.chip}`}>
                  <IconoReloj className="h-3 w-3" /> {cuando(t.venceAt)}
                </span>
              )}
              {t.responsable && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2 text-muted-foreground">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">
                    {iniciales(t.responsable)}
                  </span>
                  {t.responsable}
                </span>
              )}
              {t.oportunidad && (
                <a
                  href={`/oportunidades/${t.oportunidad.id}`}
                  className="inline-flex max-w-full items-center truncate rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary hover:bg-primary/15"
                >
                  {t.oportunidad.titulo} · {t.oportunidad.contacto}
                </a>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => borrar(t)}
          disabled={ocupada === t.id}
          aria-label={`Borrar "${t.titulo}"`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-100 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
        >
          <IconoCerrar className="h-4 w-4" />
        </button>
      </li>
    );
  }

  function grupo(titulo: string, tono: Tono, lista: Tarea[]) {
    if (lista.length === 0) return null;
    return (
      <section className="surface overflow-hidden">
        <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
          <span className={`h-2 w-2 rounded-full ${TONOS[tono].punto}`} />
          <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{lista.length}</span>
        </header>
        <ul className="divide-y divide-border/60">
          {lista.map(fila)}
        </ul>
      </section>
    );
  }

  const resumen = [
    { etiqueta: "Vencidas", valor: grupos.vencidas.length, tono: "vencida" as Tono },
    { etiqueta: "Para hoy", valor: grupos.hoy.length, tono: "hoy" as Tono },
    { etiqueta: "Próximas", valor: grupos.proximas.length + grupos.sinFecha.length, tono: "proxima" as Tono },
    { etiqueta: "Completadas", valor: completadas.length, tono: "hecha" as Tono }
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tareas</h1>
          <p className="text-sm text-muted-foreground">
            {pendientes.length === 0 ? "Todo al día" : `${pendientes.length} pendiente${pendientes.length === 1 ? "" : "s"}`}
            {grupos.vencidas.length > 0 && <span className="font-medium text-destructive"> · {grupos.vencidas.length} vencida{grupos.vencidas.length === 1 ? "" : "s"}</span>}
          </p>
        </div>
        <Boton onClick={() => setModal(true)}>+ Nueva tarea</Boton>
      </div>

      {tareas.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {resumen.map((r) => (
            <div key={r.etiqueta} className="surface px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${TONOS[r.tono].punto}`} />
                {r.etiqueta}
              </div>
              <p className="tnum mt-1 text-2xl font-bold text-foreground">{r.valor}</p>
            </div>
          ))}
        </div>
      )}

      {tareas.length === 0 && (
        <div className="surface p-4">
          <EmptyState titulo="Nada pendiente" descripcion="Crea una tarea para que el siguiente seguimiento no se pierda." accion="Nueva tarea" href="/tareas?nueva=1" />
        </div>
      )}

      {grupo("Vencidas", "vencida", grupos.vencidas)}
      {grupo("Hoy", "hoy", grupos.hoy)}
      {grupo("Próximas", "proxima", grupos.proximas)}
      {grupo("Sin fecha", "neutra", grupos.sinFecha)}

      {completadas.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setVerCompletadas(!verCompletadas)}
            aria-expanded={verCompletadas}
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {verCompletadas ? "▾" : "▸"} Completadas ({completadas.length})
          </button>
          {verCompletadas && grupo("Completadas", "hecha", completadas)}
        </div>
      )}

      <Modal abierto={modal} onClose={() => setModal(false)} titulo="Nueva tarea">
        <form onSubmit={crear} className="space-y-3">
          <Campo label="Título" value={form.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Llamar a Ana para confirmar" required />
          <Campo label="Descripción" value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} placeholder="Opcional" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Vence" type="datetime-local" value={form.venceAt} onChange={(e) => set("venceAt", e.target.value)} />
            <label className="block space-y-1">
              <span className="text-sm font-medium text-muted-foreground">Responsable</span>
              <select value={form.responsableId} onChange={(e) => set("responsableId", e.target.value)}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">Yo</option>
                {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Boton type="button" variante="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Crear"}</Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
