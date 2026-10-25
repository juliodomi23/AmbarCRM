"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FormularioModulo, type ConfigEdicion, type EdicionFila } from "@/components/modulos/FormularioModulo";
import { Badge, EncabezadoPagina, tonoEstado } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { IconoBuscar } from "@/components/icons";

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
      <EncabezadoPagina titulo={titulo} descripcion={descripcion} acciones={acciones} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricas.map((metrica) => (
          <article
            key={metrica.etiqueta}
            className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-soft"
          >
            <span className="absolute inset-x-0 top-0 h-1 bg-brand-gradient" aria-hidden="true" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {metrica.etiqueta}
            </p>
            <p className="mt-1 text-2xl font-bold tnum text-foreground">{metrica.valor}</p>
          </article>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-64 flex-1">
          <IconoBuscar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar…"
            aria-label="Buscar registros"
            className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-primary/25"
          />
        </label>
        <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground tnum">
          {visibles.length === items.length ? `${items.length} registros` : `${visibles.length} de ${items.length}`}
        </span>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {visibles.map((item) => {
          const inicial = item.titulo.trim().charAt(0).toLocaleUpperCase("es-MX") || "?";
          const contenido = (
            <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-xs font-bold uppercase text-primary"
                aria-hidden="true"
              >
                {inicial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{item.titulo}</p>
                <p className="truncate text-xs text-muted-foreground">{item.descripcion}</p>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2 text-right sm:flex-col sm:items-end sm:gap-0.5">
                <Badge tono={tonoEstado(item.estado)}>
                  <span className="capitalize">{item.estado.replaceAll("_", " ")}</span>
                </Badge>
                {item.dato && <p className="text-sm font-semibold text-foreground tnum">{item.dato}</p>}
              </div>
            </div>
          );
          const enlace = item.href ? (
            <Link href={item.href} className="block min-w-0 flex-1 focus-visible:outline-none">
              {contenido}
            </Link>
          ) : (
            <div className="min-w-0 flex-1">{contenido}</div>
          );
          return (
            <div
              key={item.id}
              className="group flex items-center border-b border-border/60 transition last:border-0 hover:bg-muted/40"
            >
              {enlace}
              {edicion && item.edicion && (
                <div className="shrink-0 px-2">
                  <FormularioModulo
                    discreto
                    boton="Editar"
                    titulo={edicion.titulo}
                    endpoint={item.edicion.endpoint}
                    campos={edicion.campos}
                    valores={item.edicion.valores}
                    eliminar={edicion.eliminar}
                    acciones={edicion.acciones}
                  />
                </div>
              )}
            </div>
          );
        })}
        {!visibles.length && (
          <div className="p-5">
            <EmptyState titulo="Sin registros" descripcion="Cuando agregues o recibas registros aparecerán aquí." />
          </div>
        )}
      </section>
    </div>
  );
}
