"use client";

import { useEffect, useState } from "react";
import { Campo } from "@/components/ui";
import type { ContactoCita } from "./tipos";

export function SelectorContactoCita({ abierto, editando, value, contactos, onChange }: {
  abierto: boolean;
  editando: boolean;
  value: string;
  contactos: ContactoCita[];
  onChange: (id: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState(contactos);
  const [seleccionado, setSeleccionado] = useState(() => contactos.find((c) => c.id === value));
  const [cargando, setCargando] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!abierto || editando) return;
    const controlador = new AbortController();
    const temporizador = setTimeout(async () => {
      setCargando(true);
      setError("");
      try {
        const res = await fetch(`/api/citas/contactos?${new URLSearchParams({ q: busqueda })}`, { signal: controlador.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudieron buscar los contactos");
        if (!controlador.signal.aborted) { setResultados(data.contactos); setHayMas(data.hayMas); }
      } catch (err) {
        if (!controlador.signal.aborted) setError(err instanceof Error ? err.message : "No se pudieron buscar los contactos");
      } finally { if (!controlador.signal.aborted) setCargando(false); }
    }, 250);
    return () => { clearTimeout(temporizador); controlador.abort(); };
  }, [abierto, editando, busqueda]);

  const opciones = seleccionado && !resultados.some((c) => c.id === seleccionado.id) ? [seleccionado, ...resultados] : resultados;
  return <div className="space-y-2">
    {!editando && <Campo label="Buscar contacto" placeholder="Nombre o teléfono" maxLength={100} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />}
    <label className="block space-y-1">
      <span className="text-sm font-medium text-muted-foreground">Contacto</span>
      <select required disabled={editando} value={value} onChange={(e) => {
        setSeleccionado(opciones.find((c) => c.id === e.target.value));
        onChange(e.target.value);
      }} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
        <option value="">Selecciona un contacto…</option>
        {opciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.telefono ? ` · ${c.telefono}` : ""}</option>)}
      </select>
    </label>
    {!editando && <p role="status" className="text-xs text-muted-foreground">{cargando ? "Buscando…" : hayMas ? "Hay más contactos. Escribe su nombre o teléfono para encontrarlos." : !resultados.length ? "No se encontraron contactos." : "Busca entre todos los contactos de tu empresa."}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
