import Link from "next/link";
import type { ReactNode } from "react";

const SECCIONES = [
  { href: "/contenido", nombre: "Semana", clave: "semana" },
  { href: "/contenido/tablero", nombre: "Tablero", clave: "tablero" },
  { href: "/contenido/revision", nombre: "Revisión", clave: "revision" },
  { href: "/contenido/piezas", nombre: "Piezas", clave: "piezas" },
];

export function ContenidoNavegacion({
  actual, titulo, descripcion, acciones, pendientes = 0,
}: {
  actual: string;
  titulo: ReactNode;
  descripcion: string;
  acciones?: ReactNode;
  pendientes?: number;
}) {
  return (
    <header className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Contenido y copys</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">{titulo}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{descripcion}</p>
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
      <nav aria-label="Secciones de contenido" role="tablist" className="flex snap-x gap-2 overflow-x-auto border-b border-border/70 pb-2">
        {SECCIONES.map((seccion) => {
          const seleccionado = actual === seccion.clave;
          return (
            <Link key={seccion.clave} href={seccion.href} role="tab" aria-current={seleccionado ? "page" : undefined} aria-selected={seleccionado} className={`inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-lg px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${seleccionado ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              {seccion.nombre}
              {seccion.clave === "revision" && pendientes > 0 && <span className="rounded-full bg-warning/20 px-1.5 text-[11px] font-semibold text-warning">{pendientes}</span>}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
