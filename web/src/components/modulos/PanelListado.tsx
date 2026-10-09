"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FormularioModulo, type ConfigEdicion, type EdicionFila } from "@/components/modulos/FormularioModulo";

export type ItemListado = {
  id: string;
  titulo: string;
  descripcion: string;
  estado: string;
  dato?: string;
  href?: string;
  edicion?: EdicionFila;
};

export function PanelListado({
  titulo,
  descripcion,
  items,
  metricas,
  acciones,
  edicion,
}: {
  titulo: string;
  descripcion: string;
  items: ItemListado[];
  metricas: { etiqueta: string; valor: string }[];
  acciones?: React.ReactNode;
  edicion?: ConfigEdicion;
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
          const enlace = item.href ? (
            <Link href={item.href} className="block min-w-0 flex-1 hover:bg-muted/40">{contenido}</Link>
          ) : <div className="min-w-0 flex-1">{contenido}</div>;
          return (
            <div key={item.id} className="flex items-center border-b last:border-0">
              {enlace}
              {edicion && item.edicion && (
                <div className="shrink-0 px-3">
                  <FormularioModulo discreto boton="Editar" titulo={edicion.titulo} endpoint={item.edicion.endpoint}
                    campos={edicion.campos} valores={item.edicion.valores} eliminar={edicion.eliminar}
                    acciones={edicion.acciones} />
                </div>
              )}
            </div>
          );
        })}
        {!visibles.length && <p className="p-8 text-center text-sm text-muted-foreground">Sin registros.</p>}
      </section>
    </div>
  );
}
