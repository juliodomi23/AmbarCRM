"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FormularioModulo, type ConfigEdicion, type EdicionFila } from "@/components/modulos/FormularioModulo";
import { EncabezadoPagina, Badge, tonoEstado } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { IconoBuscar } from "@/components/icons";

export type FilaLegal = {
  id: string;
  titulo: string;
  subtitulo: string;
  estado: string;
  fecha: string | null;
  href?: string;
  edicion?: EdicionFila;
  importe?: number;
};

export function PanelLegal({
  titulo,
  descripcion,
  filas,
  metricas,
  acciones,
  edicion,
}: {
  titulo: string;
  descripcion: string;
  filas: FilaLegal[];
  metricas: { etiqueta: string; valor: string }[];
  acciones?: React.ReactNode;
  edicion?: ConfigEdicion;
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
        <select
          value={estado}
          onChange={(evento) => setEstado(evento.target.value)}
          aria-label="Filtrar por estado"
          className="rounded-full border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/25"
        >
          <option value="">Todos los estados</option>
          {estados.map((item) => (
            <option key={item} value={item}>
              {item.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground tnum">
          {filtradas.length === filas.length ? `${filas.length} registros` : `${filtradas.length} de ${filas.length}`}
        </span>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {filtradas.map((fila) => {
          const inicial = fila.titulo.trim().charAt(0).toLocaleUpperCase("es-MX") || "?";
          const contenido = (
            <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-xs font-bold uppercase text-primary"
                aria-hidden="true"
              >
                {inicial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{fila.titulo}</p>
                <p className="truncate text-xs text-muted-foreground">{fila.subtitulo}</p>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2 text-right sm:flex-col sm:items-end sm:gap-0.5">
                <Badge tono={tonoEstado(fila.estado)}>
                  <span className="capitalize">{fila.estado.replaceAll("_", " ")}</span>
                </Badge>
                {fila.fecha && <p className="text-[11px] text-muted-foreground tnum">{fila.fecha}</p>}
                {fila.importe !== undefined && (
                  <p className="text-sm font-semibold text-foreground tnum">
                    {fila.importe.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}
                  </p>
                )}
              </div>
            </div>
          );
          const enlace = fila.href ? (
            <Link href={fila.href} className="block min-w-0 flex-1 focus-visible:outline-none">
              {contenido}
            </Link>
          ) : (
            <div className="min-w-0 flex-1">{contenido}</div>
          );
          return (
            <div
              key={fila.id}
              className="group flex items-center border-b border-border/60 transition last:border-0 hover:bg-muted/40"
            >
              {enlace}
              {edicion && fila.edicion && (
                <div className="shrink-0 px-2">
                  <FormularioModulo
                    discreto
                    boton="Editar"
                    titulo={edicion.titulo}
                    endpoint={fila.edicion.endpoint}
                    campos={edicion.campos}
                    valores={fila.edicion.valores}
                    eliminar={edicion.eliminar}
                    acciones={edicion.acciones}
                  />
                </div>
              )}
            </div>
          );
        })}
        {filtradas.length === 0 && (
          <div className="p-5">
            <EmptyState titulo="Sin registros" descripcion="No hay registros que coincidan con el filtro." />
          </div>
        )}
      </section>
    </div>
  );
}
