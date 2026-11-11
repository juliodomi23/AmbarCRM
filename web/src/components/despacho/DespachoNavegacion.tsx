import Link from "next/link";
import type { ReactNode } from "react";

const SECCIONES = [
  { href: "/despacho", nombre: "Resumen", clave: "resumen", gestion: false },
  { href: "/despacho/tablero", nombre: "Tablero", clave: "tablero", gestion: false },
  { href: "/despacho/clientes", nombre: "Clientes", clave: "clientes", gestion: false },
  { href: "/despacho/mi-trabajo", nombre: "Mi trabajo", clave: "mi-trabajo", gestion: false },
  { href: "/despacho/configuracion", nombre: "Configuración", clave: "configuracion", gestion: true },
];

export function DespachoNavegacion({
  actual, titulo, descripcion, acciones, esGestion = false,
}: {
  actual: string;
  titulo: ReactNode;
  descripcion: string;
  acciones?: ReactNode;
  esGestion?: boolean;
}) {
  const visibles = SECCIONES.filter((seccion) => !seccion.gestion || esGestion);
  return (
    <header className="space-y-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Despacho contable</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{titulo}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{descripcion}</p>
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
      <nav aria-label="Secciones del despacho" role="tablist" className="flex flex-wrap gap-1.5 border-b border-border/70 pb-3">
        {visibles.map((seccion) => {
          const seleccionado = actual === seccion.clave;
          return (
            <Link key={seccion.clave} href={seccion.href} role="tab" aria-current={seleccionado ? "page" : undefined} aria-selected={seleccionado} className={`inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${seleccionado ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              {seccion.nombre}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
