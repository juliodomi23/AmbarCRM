"use client";

import Link from "next/link";
import { TallerIcono } from "@/components/taller/TallerIcono";

export function TallerImprimirMenu({ ordenId }: { ordenId: string }) {
  return (
    <details className="group relative">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted [&::-webkit-details-marker]:hidden">
        <TallerIcono nombre="orden" className="h-4 w-4" />
        Imprimir
        <TallerIcono nombre="flecha" className="h-3.5 w-3.5 rotate-90 text-muted-foreground" />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-border bg-card p-1 shadow-soft">
        <Link
          href={`/taller/ordenes/${ordenId}/imprimir?doc=recepcion`}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-10 items-center rounded-md px-3 text-sm hover:bg-muted"
        >
          Orden de recepción
        </Link>
        <Link
          href={`/taller/ordenes/${ordenId}/imprimir?doc=cotizacion`}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-10 items-center rounded-md px-3 text-sm hover:bg-muted"
        >
          Cotización
        </Link>
      </div>
    </details>
  );
}
