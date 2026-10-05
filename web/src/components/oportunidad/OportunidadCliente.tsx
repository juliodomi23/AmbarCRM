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
  ganada: "border-green-400", perdida: "border-red-400", etapa_cambio: "border-primary/40",
  nota: "border-amber-400", tarea: "border-sky-400", creada: "border-input",
  mensaje: "border-input", asignacion: "border-purple-400"
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
    : "bg-muted text-muted-foreground";

  return (
    <div className="p-4 md:p-6">
      <Link href="/embudos" className="text-sm text-primary hover:underline">← Volver al embudo</Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">{op.titulo}</h1>
          <p className="text-sm text-muted-foreground">
            {op.contacto.nombre}{op.contacto.telefono ? ` · ${op.contacto.telefono}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-primary">{formatoMoneda(Number(op.valor), op.moneda)}</p>
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${badge}`}>
            {op.etapa.nombre}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <span className="rounded-lg bg-muted px-3 py-1 text-muted-foreground">Embudo: {op.embudo.nombre}</span>
        <span className="rounded-lg bg-muted px-3 py-1 text-muted-foreground">Responsable: {op.responsable?.nombre ?? "—"}</span>
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
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 font-semibold text-foreground">Notas</h2>
          <form onSubmit={agregarNota} className="mb-3 space-y-2">
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escribe una nota…"
              className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" rows={2} />
            <Boton type="submit" disabled={guardando} className="w-full">Agregar nota</Boton>
          </form>
          <div className="space-y-3">
            {op.notas.length === 0 && <p className="text-sm text-muted-foreground">Sin notas.</p>}
            {op.notas.map((n: any) => (
              <div key={n.id} className="rounded-lg bg-amber-50 border border-amber-100 p-2.5 text-sm">
                <p className="whitespace-pre-wrap text-foreground">{n.contenido}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{n.usuario?.nombre ?? "—"} · {fecha(n.createdAt)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tareas */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 font-semibold text-foreground">Tareas</h2>
          <form onSubmit={agregarTarea} className="mb-3 flex gap-2">
            <input value={tarea} onChange={(e) => setTarea(e.target.value)} placeholder="Nueva tarea…"
              className="flex-1 rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
            <Boton type="submit">+</Boton>
          </form>
          <div className="space-y-2">
            {op.tareas.length === 0 && <p className="text-sm text-muted-foreground">Sin tareas.</p>}
            {op.tareas.map((t: any) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={t.completada} onChange={() => toggleTarea(t)} className="h-4 w-4 accent-primary" />
                <span className={t.completada ? "text-muted-foreground line-through" : "text-foreground"}>{t.titulo}</span>
                {t.venceAt && <span className="ml-auto text-[11px] text-muted-foreground">{fecha(t.venceAt)}</span>}
              </label>
            ))}
          </div>
        </section>

        {/* Timeline */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 font-semibold text-foreground">Historial</h2>
          <div className="space-y-3">
            {op.eventos.length === 0 && <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>}
            {op.eventos.map((ev: any) => (
              <div key={ev.id} className={`border-l-2 pl-3 text-sm ${COLOR_EVENTO[ev.tipo] ?? "border-border"}`}>
                <p className="font-medium text-foreground">
                  <span className="mr-1">{ICONO_EVENTO[ev.tipo] ?? "•"}</span>
                  {ETIQUETA_EVENTO[ev.tipo] ?? ev.tipo}
                </p>
                {ev.descripcion && <p className="text-muted-foreground">{ev.descripcion}</p>}
                <p className="text-[11px] text-muted-foreground">{ev.usuario?.nombre ?? "Sistema"} · {fecha(ev.createdAt)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
