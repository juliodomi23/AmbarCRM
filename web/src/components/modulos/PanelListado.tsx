"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type ItemListado = {
  id: string;
  titulo: string;
  descripcion: string;
  estado: string;
  dato?: string;
  href?: string;
};

export function PanelListado({
  titulo,
  descripcion,
  items,
  metricas,
}: {
  titulo: string;
  descripcion: string;
  items: ItemListado[];
  metricas: { etiqueta: string; valor: string }[];
}) {
  const [busqueda, setBusqueda] = useState("");
  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return items.filter((item) =>
      !termino || `${item.titulo} ${item.descripcion} ${item.estado}`.toLowerCase().includes(termino),
    );
  }, [busqueda, items]);
  return (
    <div className="space-y-5 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-bold">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{descripcion}</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricas.map((metrica) => (
          <article key={metrica.etiqueta} className="rounded-xl border bg-card p-4 shadow-soft">
            <p className="text-xs uppercase text-muted-foreground">{metrica.etiqueta}</p>
            <p className="mt-1 text-2xl font-bold">{metrica.valor}</p>
          </article>
        ))}
      </section>
      <input
        type="search"
        value={busqueda}
        onChange={(evento) => setBusqueda(evento.target.value)}
        placeholder="Buscar…"
        className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
      />
      <section className="overflow-hidden rounded-xl border bg-card">
        {visibles.map((item) => {
          const contenido = (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{item.titulo}</p>
                <p className="text-xs text-muted-foreground">{item.descripcion}</p>
              </div>
              <div className="text-right">
                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs capitalize text-primary">
                  {item.estado.replaceAll("_", " ")}
                </span>
                {item.dato && <p className="mt-1 text-sm font-semibold">{item.dato}</p>}
              </div>
            </div>
          );
          return item.href ? (
            <Link key={item.id} href={item.href} className="block border-b last:border-0 hover:bg-muted/40">
              {contenido}
            </Link>
          ) : <article key={item.id} className="border-b last:border-0">{contenido}</article>;
        })}
        {!visibles.length && <p className="p-8 text-center text-sm text-muted-foreground">Sin registros.</p>}
      </section>
    </div>
  );
}
