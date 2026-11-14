"use client";

import { useRouter } from "next/navigation";

const MESES = Array.from({ length: 12 }, (_, indice) => ({
  valor: String(indice + 1).padStart(2, "0"),
  nombre: new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, indice, 1))),
}));

export function DespachoSelectorMes({ mes, anios, ruta }: { mes: string; anios: number[]; ruta: string }) {
  const router = useRouter();
  const [anio, mesActual] = mes.split("-");
  const ir = (nuevoAnio: string, nuevoMes: string) => router.push(`${ruta}?mes=${nuevoAnio}-${nuevoMes}`);

  return (
    <span className="flex items-center gap-1">
      <select
        aria-label="Mes"
        value={mesActual}
        onChange={(evento) => ir(anio, evento.target.value)}
        className="min-h-8 rounded-lg bg-transparent px-2 text-sm font-medium capitalize text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {MESES.map((opcion) => <option key={opcion.valor} value={opcion.valor} className="capitalize">{opcion.nombre}</option>)}
      </select>
      <select
        aria-label="Año"
        value={anio}
        onChange={(evento) => ir(evento.target.value, mesActual)}
        className="min-h-8 rounded-lg bg-transparent px-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {anios.map((opcion) => <option key={opcion} value={opcion}>{opcion}</option>)}
      </select>
    </span>
  );
}
