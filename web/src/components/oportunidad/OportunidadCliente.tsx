"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boton, formatoMoneda } from "@/components/ui";

function fecha(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const ICONO_EVENTO: Record<string, string> = {
  creada: "·", etapa_cambio: "→", ganada: "★", perdida: "✕",
  nota: "—", tarea: "□", mensaje: "◇", asignacion: "◎"
};
const ETIQUETA_EVENTO: Record<string, string> = {
  creada: "Creada", etapa_cambio: "Cambio de etapa", ganada: "Ganada", perdida: "Perdida",
  nota: "Nota", tarea: "Tarea", mensaje: "Mensaje", asignacion: "Asignación"
};
const COLOR_EVENTO: Record<string, string> = {
  ganada: "border-green-400", perdida: "border-red-400", etapa_cambio: "border-navy/40",
  nota: "border-amber-400", tarea: "border-sky-400", creada: "border-slate-300",
  mensaje: "border-slate-300", asignacion: "border-purple-400"
};

export function OportunidadCliente({ op }: { op: any }) {
  const router = useRouter();
  const [nota, setNota] = useState("");
  const [tarea, setTarea] = useState("");
  const [guardando, setGuardando] = useState(false);

  const convId = op.contacto.conversaciones?.[0]?.id ?? null;

  async function agregarNota(e: React.FormEvent) {
    e.preventDefault();
    if (!nota.trim()) return;
    setGuardando(true);
    await fetch(`/api/oportunidades/${op.id}/notas`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contenido: nota })
    });
    setGuardando(false);
    setNota("");
    router.refresh();
  }

  async function agregarTarea(e: React.FormEvent) {
    e.preventDefault();
    if (!tarea.trim()) return;
    await fetch("/api/tareas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: tarea, oportunidadId: op.id })
    });
    setTarea("");
    router.refresh();
  }

  async function toggleTarea(t: any) {
    await fetch(`/api/tareas/${t.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completada: !t.completada })
    });
    router.refresh();
  }

  const badge =
    op.estado === "ganado" ? "bg-green-100 text-green-700"
    : op.estado === "perdido" ? "bg-red-100 text-red-700"
    : "bg-slate-100 text-slate-600";

  return (
    <div className="p-4 md:p-6">
      <Link href="/embudos" className="text-sm text-navy hover:underline">← Volver al embudo</Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy">{op.titulo}</h1>
          <p className="text-sm text-slate-500">
            {op.contacto.nombre}{op.contacto.telefono ? ` · ${op.contacto.telefono}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-ambar">{formatoMoneda(Number(op.valor), op.moneda)}</p>
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${badge}`}>
            {op.etapa.nombre}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <span className="rounded-lg bg-slate-100 px-3 py-1 text-slate-600">Embudo: {op.embudo.nombre}</span>
        <span className="rounded-lg bg-slate-100 px-3 py-1 text-slate-600">Responsable: {op.responsable?.nombre ?? "—"}</span>
        {op.contacto.telefono && (
          <Link
            href={convId ? `/chat?conv=${convId}` : "/chat"}
            className="rounded-lg bg-green-100 px-3 py-1 font-medium text-green-700 hover:bg-green-200"
          >
            Abrir chat
          </Link>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Notas */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-semibold text-slate-700">Notas</h2>
          <form onSubmit={agregarNota} className="mb-3 space-y-2">
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escribe una nota…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30" rows={2} />
            <Boton type="submit" disabled={guardando} className="w-full">Agregar nota</Boton>
          </form>
          <div className="space-y-3">
            {op.notas.length === 0 && <p className="text-sm text-slate-400">Sin notas.</p>}
            {op.notas.map((n: any) => (
              <div key={n.id} className="rounded-lg bg-amber-50 border border-amber-100 p-2.5 text-sm">
                <p className="whitespace-pre-wrap text-slate-700">{n.contenido}</p>
                <p className="mt-1 text-[11px] text-slate-400">{n.usuario?.nombre ?? "—"} · {fecha(n.createdAt)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tareas */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-semibold text-slate-700">Tareas</h2>
          <form onSubmit={agregarTarea} className="mb-3 flex gap-2">
            <input value={tarea} onChange={(e) => setTarea(e.target.value)} placeholder="Nueva tarea…"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30" />
            <Boton type="submit">+</Boton>
          </form>
          <div className="space-y-2">
            {op.tareas.length === 0 && <p className="text-sm text-slate-400">Sin tareas.</p>}
            {op.tareas.map((t: any) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={t.completada} onChange={() => toggleTarea(t)} className="h-4 w-4 accent-navy" />
                <span className={t.completada ? "text-slate-400 line-through" : "text-slate-700"}>{t.titulo}</span>
                {t.venceAt && <span className="ml-auto text-[11px] text-slate-400">{fecha(t.venceAt)}</span>}
              </label>
            ))}
          </div>
        </section>

        {/* Timeline */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-semibold text-slate-700">Historial</h2>
          <div className="space-y-3">
            {op.eventos.length === 0 && <p className="text-sm text-slate-400">Sin actividad registrada.</p>}
            {op.eventos.map((ev: any) => (
              <div key={ev.id} className={`border-l-2 pl-3 text-sm ${COLOR_EVENTO[ev.tipo] ?? "border-slate-200"}`}>
                <p className="font-medium text-slate-700">
                  <span className="mr-1">{ICONO_EVENTO[ev.tipo] ?? "•"}</span>
                  {ETIQUETA_EVENTO[ev.tipo] ?? ev.tipo}
                </p>
                {ev.descripcion && <p className="text-slate-500">{ev.descripcion}</p>}
                <p className="text-[11px] text-slate-400">{ev.usuario?.nombre ?? "Sistema"} · {fecha(ev.createdAt)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
