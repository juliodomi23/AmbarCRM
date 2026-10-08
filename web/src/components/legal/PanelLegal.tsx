"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type FilaLegal = {
  id: string;
  titulo: string;
  subtitulo: string;
  estado: string;
  fecha: string | null;
  href?: string;
  importe?: number;
};

export function PanelLegal({
  titulo,
  descripcion,
  filas,
  metricas,
  acciones,
}: {
  titulo: string;
  descripcion: string;
  filas: FilaLegal[];
  metricas: { etiqueta: string; valor: string }[];
  acciones?: React.ReactNode;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("");
  const estados = [...new Set(filas.map((fila) => fila.estado))].sort();
  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return filas.filter((fila) => {
      if (estado && fila.estado !== estado) return false;
      return !termino || `${fila.titulo} ${fila.subtitulo}`.toLowerCase().includes(termino);
    });
  }, [busqueda, estado, filas]);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{titulo}</h1>
          <p className="text-sm text-muted-foreground">{descripcion}</p>
        </div>
        {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricas.map((metrica) => (
          <article key={metrica.etiqueta} className="rounded-xl border bg-card p-4 shadow-soft">
            <p className="text-xs uppercase text-muted-foreground">{metrica.etiqueta}</p>
            <p className="mt-1 text-2xl font-bold">{metrica.valor}</p>
          </article>
        ))}
      </section>
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar…"
          className="min-w-64 flex-1 rounded-lg border bg-card px-3 py-2 text-sm"
        />
        <select
          value={estado}
          onChange={(evento) => setEstado(evento.target.value)}
          className="rounded-lg border bg-card px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {estados.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      <section className="overflow-hidden rounded-xl border bg-card">
        {filtradas.map((fila) => {
          const contenido = (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{fila.titulo}</p>
                <p className="truncate text-xs text-muted-foreground">{fila.subtitulo}</p>
              </div>
              <div className="text-right text-sm">
                <span className="rounded-full bg-primary/10 px-2 py-1 capitalize text-primary">
                  {fila.estado.replaceAll("_", " ")}
                </span>
                {fila.fecha && <p className="mt-1 text-xs text-muted-foreground">{fila.fecha}</p>}
                {fila.importe !== undefined && (
                  <p className="mt-1 font-semibold">
                    {fila.importe.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}
                  </p>
                )}
              </div>
            </div>
          );
          return fila.href ? (
            <Link key={fila.id} href={fila.href} className="block border-b last:border-0 hover:bg-muted/40">
              {contenido}
            </Link>
          ) : (
            <article key={fila.id} className="border-b last:border-0">{contenido}</article>
          );
        })}
        {filtradas.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">No hay registros para mostrar.</p>
        )}
      </section>
    </div>
  );
}
