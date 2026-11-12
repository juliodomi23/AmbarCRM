"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo } from "@/components/ui";
import { toast } from "@/components/Toaster";

type Procedimiento = { id: string; nombre: string; estado: string; resultado: string | null };

const ACCIONES = [
  {
    valor: "pendiente",
    etiqueta: "Pendiente",
    claseActivo: "border-muted-foreground/40 bg-muted text-foreground",
    icono: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="8" /></svg>
    ),
  },
  {
    valor: "hecho",
    etiqueta: "Hecho",
    claseActivo: "border-success bg-success/15 text-success",
    icono: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
    ),
  },
  {
    valor: "con_observacion",
    etiqueta: "Con observación",
    claseActivo: "border-destructive bg-destructive/15 text-destructive",
    icono: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /></svg>
    ),
  },
] as const;

function FilaProcedimiento({ auditoriaId, procedimiento, onCambio }: {
  auditoriaId: string;
  procedimiento: Procedimiento;
  onCambio: (id: string, cambios: Partial<Procedimiento>) => void;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [notaAbierta, setNotaAbierta] = useState(false);
  const [resultado, setResultado] = useState(procedimiento.resultado ?? "");
  const [quitando, setQuitando] = useState(false);

  async function cambiarEstado(estado: string, resultadoNuevo?: string) {
    setCargando(true);
    const anterior = { estado: procedimiento.estado, resultado: procedimiento.resultado };
    onCambio(procedimiento.id, { estado, ...(resultadoNuevo !== undefined ? { resultado: resultadoNuevo } : {}) });
    const respuesta = await fetch(`/api/auditoria/fiscal/${auditoriaId}/procedimientos/${procedimiento.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado, ...(resultadoNuevo !== undefined ? { resultado: resultadoNuevo } : {}) }),
    });
    setCargando(false);
    if (!respuesta.ok) {
      onCambio(procedimiento.id, anterior);
      const datos = await respuesta.json().catch(() => ({}));
      toast(datos.error ?? "No se pudo actualizar", "error");
      return;
    }
    if (estado !== "con_observacion") setNotaAbierta(false);
  }

  function elegir(valor: string) {
    if (cargando) return;
    if (valor === "con_observacion") { setNotaAbierta(true); return; }
    setNotaAbierta(false);
    void cambiarEstado(valor);
  }

  async function guardarNota() {
    await cambiarEstado("con_observacion", resultado);
  }

  async function quitar() {
    setQuitando(true);
    const respuesta = await fetch(`/api/auditoria/fiscal/${auditoriaId}/procedimientos/${procedimiento.id}`, { method: "DELETE" });
    if (!respuesta.ok) {
      setQuitando(false);
      const datos = await respuesta.json().catch(() => ({}));
      toast(datos.error ?? "No se pudo quitar", "error");
      return;
    }
    router.refresh();
  }

  return (
    <div className={`space-y-2 py-3 transition-opacity ${quitando ? "pointer-events-none opacity-40" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{procedimiento.nombre}</p>
        <button
          type="button"
          onClick={() => void quitar()}
          aria-label={`Quitar ${procedimiento.nombre}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      <div role="group" aria-label={`Estado de ${procedimiento.nombre}`} className="inline-flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {ACCIONES.map((accion) => {
          const activo = procedimiento.estado === accion.valor;
          return (
            <button
              key={accion.valor}
              type="button"
              aria-pressed={activo}
              disabled={cargando}
              onClick={() => elegir(accion.valor)}
              className={`flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${activo ? accion.claseActivo : "border-transparent text-muted-foreground hover:bg-card hover:text-foreground"}`}
            >
              {accion.icono}
              <span className="hidden sm:inline">{accion.etiqueta}</span>
            </button>
          );
        })}
      </div>

      {notaAbierta ? (
        <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
          <textarea
            autoFocus
            className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm"
            rows={2}
            placeholder="¿Cuál fue la observación?"
            value={resultado}
            onChange={(e) => setResultado(e.target.value)}
          />
          <div className="flex gap-1.5">
            <Boton className="min-h-8 px-3 text-xs" onClick={() => void guardarNota()} disabled={cargando}>{cargando ? "Guardando…" : "Guardar observación"}</Boton>
            <Boton variante="ghost" className="min-h-8 px-3 text-xs" onClick={() => { setNotaAbierta(false); setResultado(procedimiento.resultado ?? ""); }}>Cancelar</Boton>
          </div>
        </div>
      ) : procedimiento.resultado ? (
        <button type="button" onClick={() => setNotaAbierta(true)} className="block max-w-full truncate rounded px-0.5 text-left text-xs text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {procedimiento.resultado}
        </button>
      ) : null}
    </div>
  );
}

export function AuditoriaFiscalProcedimientos({ auditoriaId, iniciales }: {
  auditoriaId: string;
  iniciales: Procedimiento[];
  opciones?: { valor: string; etiqueta: string }[];
}) {
  const router = useRouter();
  const [procedimientos, setProcedimientos] = useState(iniciales);
  const [nombre, setNombre] = useState("");
  const [enviando, setEnviando] = useState(false);

  function actualizar(id: string, cambios: Partial<Procedimiento>) {
    setProcedimientos((lista) => lista.map((item) => item.id === id ? { ...item, ...cambios } : item));
  }

  async function agregar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!nombre.trim()) return;
    setEnviando(true);
    const respuesta = await fetch(`/api/auditoria/fiscal/${auditoriaId}/procedimientos`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    setEnviando(false);
    if (!respuesta.ok) { toast(datos.error ?? "No se pudo agregar", "error"); return; }
    setNombre("");
    router.refresh();
  }

  const total = procedimientos.length;
  const hechos = procedimientos.filter((p) => p.estado === "hecho").length;

  return (
    <div className="space-y-3">
      {total > 0 && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success transition-all" style={{ width: `${Math.round((hechos / total) * 100)}%` }} /></div>
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{hechos}/{total}</span>
        </div>
      )}
      {procedimientos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin procedimientos capturados todavía.</p>
      ) : (
        <div className="divide-y divide-border/60">
          {procedimientos.map((procedimiento) => (
            <FilaProcedimiento key={procedimiento.id} auditoriaId={auditoriaId} procedimiento={procedimiento} onCambio={actualizar} />
          ))}
        </div>
      )}
      <form onSubmit={agregar} className="flex flex-wrap items-end gap-2">
        <Campo label="Nuevo procedimiento o prueba" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Conciliación de CFDI contra pólizas" />
        <Boton type="submit" disabled={enviando}>{enviando ? "Agregando…" : "Agregar"}</Boton>
      </form>
    </div>
  );
}
