"use client";

import { useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCorners, type DragStartEvent, type DragOverEvent, type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatoMoneda } from "@/components/ui";
import { IconoCerrar, IconoFlecha } from "@/components/icons";

export type Tarjeta = {
  id: string;
  titulo: string;
  valor: number;
  moneda: string;
  createdAt: string;
  conversacionId: string | null;
  contacto: { nombre: string; telefono: string | null };
  responsable: { nombre: string } | null;
};
export type Columna = { id: string; nombre: string; color: string; tipo: string; tarjetas: Tarjeta[] };

type Rango = "todo" | "hoy" | "semana" | "mes";

function dentroDeRango(iso: string, rango: Rango): boolean {
  if (rango === "todo") return true;
  const d = new Date(iso);
  const ahora = new Date();
  if (rango === "hoy") {
    const ini = new Date(); ini.setHours(0, 0, 0, 0);
    return d >= ini;
  }
  const dias = rango === "semana" ? 7 : 30;
  const desde = new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000);
  return d >= desde;
}

function TarjetaVista({ t, onBorrar }: { t: Tarjeta; onBorrar?: (id: string) => void }) {
  return (
    <div className="group relative rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      {onBorrar && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onBorrar(t.id)}
          title="Quitar del embudo"
          aria-label="Quitar del embudo"
          className="absolute right-1.5 top-1.5 hidden h-5 w-5 place-items-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 group-hover:grid"
        >
          <IconoCerrar className="h-3.5 w-3.5" />
        </button>
      )}
      <p className="pr-5 text-sm font-medium text-slate-800">{t.titulo}</p>
      <p className="mt-0.5 text-xs text-slate-500">{t.contacto.nombre}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-ambar">{formatoMoneda(t.valor, t.moneda)}</span>
        {t.responsable && (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-navy/10 text-[10px] font-bold text-navy">
            {t.responsable.nombre.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <Link
        href={`/oportunidades/${t.id}`}
        onPointerDown={(e) => e.stopPropagation()}
        className="mt-2 flex items-center justify-end gap-1 text-[11px] font-medium text-navy hover:underline"
      >
        Abrir <IconoFlecha className="h-3 w-3 rotate-180" />
      </Link>
    </div>
  );
}

function TarjetaSortable({ t, onBorrar, onChat }: { t: Tarjeta; onBorrar: (id: string) => void; onChat: (t: Tarjeta) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      onDoubleClick={() => onChat(t)}
      title="Doble clic para abrir el chat"
      className="cursor-grab active:cursor-grabbing"
    >
      <TarjetaVista t={t} onBorrar={onBorrar} />
    </div>
  );
}

function ColumnaVista({ col, onBorrar, onChat }: { col: Columna; onBorrar: (id: string) => void; onChat: (t: Tarjeta) => void }) {
  const { setNodeRef } = useDroppable({ id: `col-${col.id}` });
  const total = col.tarjetas.reduce((s, t) => s + t.valor, 0);
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-100">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: col.color }} />
          <span className="text-sm font-semibold text-slate-700">{col.nombre}</span>
          <span className="text-xs text-slate-400">{col.tarjetas.length}</span>
        </div>
        <span className="text-xs font-medium text-slate-400">{formatoMoneda(total, "MXN")}</span>
      </div>
      <div ref={setNodeRef} className="scroll-thin flex-1 space-y-2 overflow-y-auto px-2 pb-3">
        <SortableContext items={col.tarjetas.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {col.tarjetas.map((t) => <TarjetaSortable key={t.id} t={t} onBorrar={onBorrar} onChat={onChat} />)}
        </SortableContext>
      </div>
    </div>
  );
}

const RANGOS: { id: Rango; label: string }[] = [
  { id: "todo", label: "Todo" },
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" }
];

export function Board({ columnasIniciales }: { columnasIniciales: Columna[] }) {
  const [cols, setCols] = useState<Columna[]>(columnasIniciales);
  const [activa, setActiva] = useState<Tarjeta | null>(null);
  const [rango, setRango] = useState<Rango>("todo");
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function abrirChat(t: Tarjeta) {
    if (t.conversacionId) router.push(`/chat?conv=${t.conversacionId}`);
    else alert("Este lead todavía no tiene chat de WhatsApp.");
  }

  // Vista filtrada por fecha de creación (no toca `cols`, que es la fuente para drag/persistencia).
  const colsVistas = useMemo(
    () => cols.map((c) => ({ ...c, tarjetas: c.tarjetas.filter((t) => dentroDeRango(t.createdAt, rango)) })),
    [cols, rango]
  );

  async function borrar(id: string) {
    if (!confirm("¿Quitar esta tarjeta del embudo? (No borra el contacto, solo la oportunidad.)")) return;
    setCols((prev) => prev.map((c) => ({ ...c, tarjetas: c.tarjetas.filter((t) => t.id !== id) })));
    await fetch(`/api/oportunidades/${id}`, { method: "DELETE" }).catch(() => {});
  }

  const idsPorColumna = useMemo(() => {
    const map: Record<string, string[]> = {};
    cols.forEach((c) => (map[c.id] = c.tarjetas.map((t) => t.id)));
    return map;
  }, [cols]);

  function colDe(id: string): string | null {
    if (id.startsWith("col-")) return id.slice(4);
    return cols.find((c) => c.tarjetas.some((t) => t.id === id))?.id ?? null;
  }

  function onDragStart(e: DragStartEvent) {
    const t = cols.flatMap((c) => c.tarjetas).find((x) => x.id === e.active.id);
    setActiva(t ?? null);
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const origen = colDe(active.id as string);
    const destino = colDe(over.id as string);
    if (!origen || !destino || origen === destino) return;

    setCols((prev) => {
      const copia = prev.map((c) => ({ ...c, tarjetas: [...c.tarjetas] }));
      const cOrigen = copia.find((c) => c.id === origen)!;
      const cDestino = copia.find((c) => c.id === destino)!;
      const idx = cOrigen.tarjetas.findIndex((t) => t.id === active.id);
      if (idx < 0) return prev;
      const [movida] = cOrigen.tarjetas.splice(idx, 1);
      cDestino.tarjetas.push(movida);
      return copia;
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiva(null);
    if (!over) return;

    const destino = colDe(over.id as string);
    if (!destino) return;

    // Reordenar dentro de la columna destino.
    setCols((prev) => {
      const copia = prev.map((c) => ({ ...c, tarjetas: [...c.tarjetas] }));
      const c = copia.find((x) => x.id === destino)!;
      const from = c.tarjetas.findIndex((t) => t.id === active.id);
      const to = c.tarjetas.findIndex((t) => t.id === over.id);
      if (from >= 0 && to >= 0 && from !== to) c.tarjetas = arrayMove(c.tarjetas, from, to);
      // Persistir.
      persistir(active.id as string, destino, c.tarjetas.map((t) => t.id));
      return copia;
    });
  }

  async function persistir(oportunidadId: string, etapaIdDestino: string, ordenIds: string[]) {
    try {
      await fetch("/api/oportunidades/mover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oportunidadId,
          etapaIdDestino,
          ordenIds: ordenIds.map((x) => Number(x))
        })
      });
    } catch {
      /* en caso de fallo, un refresh re-sincroniza desde la BD */
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 px-4 pt-3">
        <span className="mr-1 text-xs text-slate-400">Ver:</span>
        {RANGOS.map((r) => (
          <button
            key={r.id}
            onClick={() => setRango(r.id)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium ${rango === r.id ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        <div className="flex flex-1 gap-3 overflow-x-auto p-4">
          {colsVistas.map((c) => <ColumnaVista key={c.id} col={c} onBorrar={borrar} onChat={abrirChat} />)}
        </div>
        <DragOverlay>{activa ? <div className="w-72"><TarjetaVista t={activa} /></div> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
