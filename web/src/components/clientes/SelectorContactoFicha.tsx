"use client";

import { useEffect, useState } from "react";
import { Campo } from "@/components/ui";

type Contacto = { id: string; nombre: string; telefono: string | null };

export function SelectorContactoFicha({ modo, contactos, value, onChange }: {
  modo: "clientes" | "pacientes";
  contactos: Contacto[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState(contactos);
  const [seleccionado, setSeleccionado] = useState<Contacto>();
  const [estado, setEstado] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setEstado("Buscando…"); setError("");
      try {
        const res = await fetch(`/api/${modo}?${new URLSearchParams({ sinFicha: "1", q: busqueda })}`, { signal: abort.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudieron buscar los contactos");
        if (!abort.signal.aborted) {
          setResultados(data.contactos);
          setEstado(data.hayMas ? "Hay más contactos. Escribe su nombre o teléfono." : data.contactos.length ? "Solo aparecen contactos sin ficha." : "No encontramos contactos sin ficha con esos datos.");
        }
      } catch (err) {
        if (!abort.signal.aborted) { setError(err instanceof Error ? err.message : "Revisa tu conexión e intenta de nuevo."); setEstado(""); }
      }
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [modo, busqueda]);
  const opciones = seleccionado && !resultados.some((c) => c.id === seleccionado.id) ? [seleccionado, ...resultados] : resultados;
  return <div className="space-y-2">
    <Campo label="Buscar contacto existente" placeholder="Nombre o teléfono" value={busqueda} maxLength={100} onChange={(e) => setBusqueda(e.target.value)} />
    <label className="block space-y-1">
      <span className="text-sm font-medium text-muted-foreground">Contacto para esta ficha</span>
      <select required value={value} onChange={(e) => { setSeleccionado(opciones.find((c) => c.id === e.target.value)); onChange(e.target.value); }} className="min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
        <option value="">Selecciona un contacto…</option>
        {opciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.telefono ? ` · ${c.telefono}` : ""}</option>)}
      </select>
    </label>
    <p role="status" className="text-xs text-muted-foreground">{estado}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
