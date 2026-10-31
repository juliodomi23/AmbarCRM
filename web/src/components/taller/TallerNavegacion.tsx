import Link from "next/link";
import type { ReactNode } from "react";
import { TallerIcono } from "@/components/taller/TallerIcono";

const secciones = [
  { href: "/taller", nombre: "Vehículos", icono: "vehiculo" as const, clave: "vehiculos" },
  { href: "/taller/ordenes", nombre: "Órdenes", icono: "orden" as const, clave: "ordenes" },
  { href: "/taller/refacciones", nombre: "Refacciones", icono: "refaccion" as const, clave: "refacciones" },
  { href: "/taller/recordatorios", nombre: "Recordatorios", icono: "recordatorio" as const, clave: "recordatorios" },
];

export function TallerNavegacion({ actual, titulo, descripcion, acciones }: { actual: string; titulo: ReactNode; descripcion: string; acciones?: ReactNode }) {
  return <header className="space-y-5">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Taller de servicio</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">{titulo}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{descripcion}</p>
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
    <nav aria-label="Secciones del taller" role="tablist" className="flex snap-x gap-2 overflow-x-auto border-b border-border/70 pb-2">
      {secciones.map((item) => {
        const seleccionado = actual === item.clave;
        return <Link key={item.clave} href={item.href} role="tab" aria-current={seleccionado ? "page" : undefined} aria-selected={seleccionado} className={`inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-lg px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${seleccionado ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
          <TallerIcono nombre={item.icono} className="h-4 w-4" />{item.nombre}
        </Link>;
      })}
    </nav>
  </header>;
}
