"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Boton, Campo } from "@/components/ui";
import { toast } from "@/components/Toaster";

const TONOS: Record<string, "neutral" | "warning" | "destructive" | "success"> = {
  pendiente: "neutral", hecho: "success", con_observacion: "destructive",
};

type Procedimiento = { id: string; nombre: string; estado: string; resultado: string | null };

function FilaProcedimiento({ auditoriaId, procedimiento, opciones }: {
  auditoriaId: string;
  procedimiento: Procedimiento;
  opciones: { valor: string; etiqueta: string }[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [estado, setEstado] = useState(procedimiento.estado);
  const [resultado, setResultado] = useState(procedimiento.resultado ?? "");
  const [enviando, setEnviando] = useState(false);

  async function guardar() {
    setEnviando(true);
    const respuesta = await fetch(`/api/auditoria/fiscal/${auditoriaId}/procedimientos/${procedimiento.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado, resultado }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    setEnviando(false);
    if (!respuesta.ok) { toast(datos.error ?? "No se pudo actualizar", "error"); return; }
    setEditando(false);
    router.refresh();
  }

  async function quitar() {
    const respuesta = await fetch(`/api/auditoria/fiscal/${auditoriaId}/procedimientos/${procedimiento.id}`, { method: "DELETE" });
    if (!respuesta.ok) { const datos = await respuesta.json().catch(() => ({})); toast(datos.error ?? "No se pudo quitar", "error"); return; }
    router.refresh();
  }

  if (!editando) {
    return (
      <div className="flex items-start justify-between gap-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{procedimiento.nombre}</p>
          {procedimiento.resultado && <p className="text-xs text-muted-foreground">{procedimiento.resultado}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setEditando(true)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Badge tono={TONOS[procedimiento.estado] ?? "neutral"}>{opciones.find((o) => o.valor === procedimiento.estado)?.etiqueta ?? procedimiento.estado}</Badge>
          </button>
          <Boton variante="ghost" className="min-h-8 px-2 text-xs" onClick={() => void quitar()}>Quitar</Boton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-input bg-card p-2">
      <p className="text-sm font-medium text-foreground">{procedimiento.nombre}</p>
      <select className="w-full rounded-md border border-input bg-card px-2 py-1 text-xs" value={estado} onChange={(e) => setEstado(e.target.value)}>
        {opciones.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
      </select>
      <textarea className="w-full rounded-md border border-input bg-card px-2 py-1 text-xs" rows={2} placeholder="Resultado de la prueba" value={resultado} onChange={(e) => setResultado(e.target.value)} />
      <div className="flex gap-1.5">
        <Boton className="min-h-8 px-2 text-xs" onClick={guardar} disabled={enviando}>{enviando ? "Guardando…" : "Guardar"}</Boton>
        <Boton variante="ghost" className="min-h-8 px-2 text-xs" onClick={() => setEditando(false)}>Cancelar</Boton>
      </div>
    </div>
  );
}

export function AuditoriaFiscalProcedimientos({ auditoriaId, iniciales, opciones }: {
  auditoriaId: string;
  iniciales: Procedimiento[];
  opciones: { valor: string; etiqueta: string }[];
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [enviando, setEnviando] = useState(false);

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

  return (
    <div className="space-y-3">
      {iniciales.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin procedimientos capturados todavía.</p>
      ) : (
        <div className="divide-y divide-border/60">
          {iniciales.map((procedimiento) => (
            <FilaProcedimiento key={procedimiento.id} auditoriaId={auditoriaId} procedimiento={procedimiento} opciones={opciones} />
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
