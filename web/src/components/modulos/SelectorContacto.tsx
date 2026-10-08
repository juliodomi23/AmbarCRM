"use client";

import { useEffect, useState } from "react";

type Opcion = { id: string; titulo: string; detalle: string };

/** Busca un contacto del CRM (o lo crea con el nombre escrito) y devuelve su id. */
export function SelectorContacto({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (id: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [elegido, setElegido] = useState<string | null>(null);

  useEffect(() => {
    const termino = busqueda.trim();
    if (termino.length < 2 || elegido) return setOpciones([]);
    const temporizador = setTimeout(async () => {
      const res = await fetch(`/api/buscar?q=${encodeURIComponent(termino)}`);
      const data = await res.json().catch(() => ({}));
      setOpciones(
        (data.resultados ?? [])
          .filter((item: { tipo: string }) => item.tipo === "Contacto")
          .map((item: Opcion) => ({ ...item, id: item.id.replace("contacto-", "") })),
      );
    }, 250);
    return () => clearTimeout(temporizador);
  }, [busqueda, elegido]);

  function elegir(opcion: Opcion) {
    setElegido(opcion.titulo);
    setOpciones([]);
    onChange(opcion.id);
  }

  async function crear() {
    const nombre = busqueda.trim();
    const res = await fetch("/api/contactos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) elegir({ id: data.id, titulo: nombre, detalle: "" });
  }

  if (elegido && valor) {
    return (
      <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <span>{elegido}</span>
        <button
          type="button"
          onClick={() => {
            setElegido(null);
            onChange("");
          }}
          className="text-xs font-medium text-primary"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <input
        type="search"
        value={busqueda}
        onChange={(evento) => setBusqueda(evento.target.value)}
        placeholder="Escribe nombre o teléfono…"
        className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
      />
      {opciones.map((opcion) => (
        <button
          key={opcion.id}
          type="button"
          onClick={() => elegir(opcion)}
          className="block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-muted"
        >
          {opcion.titulo} <span className="text-xs text-muted-foreground">{opcion.detalle}</span>
        </button>
      ))}
      {busqueda.trim().length >= 2 && !opciones.length && (
        <button type="button" onClick={crear} className="text-xs font-medium text-primary">
          + Crear contacto «{busqueda.trim()}»
        </button>
      )}
    </div>
  );
}
