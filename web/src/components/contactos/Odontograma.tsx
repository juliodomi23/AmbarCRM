"use client";

import { useState } from "react";
import { toast } from "@/components/Toaster";

export type ZonaDiente = "vestibular" | "lingual" | "mesial" | "distal" | "oclusal";
export type EstadoDiente = "sano" | "caries" | "restaurado" | "extraido" | "corona" | "endodoncia";
export type Diente = { numero: number; zonas: Partial<Record<ZonaDiente, EstadoDiente>> };

export const ESTADOS_DIENTE: Record<EstadoDiente, { etiqueta: string; color: string }> = {
  sano: { etiqueta: "Sano", color: "#ffffff" },
  caries: { etiqueta: "Caries", color: "#fb7185" },
  restaurado: { etiqueta: "Restaurado", color: "#60a5fa" },
  extraido: { etiqueta: "Extraído", color: "#cbd5e1" },
  corona: { etiqueta: "Corona", color: "#fcd34d" },
  endodoncia: { etiqueta: "Endodoncia", color: "#c084fc" },
};

// Numeración FDI de dentición adulta.
const SUPERIOR = [[18, 17, 16, 15, 14, 13, 12, 11], [21, 22, 23, 24, 25, 26, 27, 28]];
const INFERIOR = [[48, 47, 46, 45, 44, 43, 42, 41], [31, 32, 33, 34, 35, 36, 37, 38]];

const ZONAS: Array<{ zona: ZonaDiente; x: number; y: number; ancho: number; alto: number }> = [
  { zona: "vestibular", x: 10, y: 8, ancho: 30, alto: 10 },
  { zona: "mesial", x: 8, y: 20, ancho: 10, alto: 20 },
  { zona: "oclusal", x: 20, y: 20, ancho: 10, alto: 20 },
  { zona: "distal", x: 32, y: 20, ancho: 10, alto: 20 },
  { zona: "lingual", x: 10, y: 42, ancho: 30, alto: 10 },
];

function Pieza({ diente, onZona }: { diente: Diente; onZona: (zona: ZonaDiente) => void }) {
  const extraido = Object.values(diente.zonas).includes("extraido");
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 50 60" className={`h-12 w-10 ${extraido ? "opacity-40" : ""}`} role="group" aria-label={`Diente ${diente.numero}`}>
        <rect x="5" y="5" width="40" height="50" rx="5" fill="#fff" stroke="#cbd5e1" strokeWidth="1" />
        {ZONAS.map(({ zona, x, y, ancho, alto }) => (
          <rect
            key={zona}
            x={x}
            y={y}
            width={ancho}
            height={alto}
            rx="2"
            fill={ESTADOS_DIENTE[diente.zonas[zona] ?? "sano"].color}
            stroke="#94a3b8"
            strokeWidth="0.5"
            className="cursor-pointer transition hover:opacity-70"
            onClick={() => onZona(zona)}
          >
            <title>{`${diente.numero} · ${zona}`}</title>
          </rect>
        ))}
      </svg>
      <span className="text-[10px] font-medium text-muted-foreground">{diente.numero}</span>
    </div>
  );
}

export function Odontograma({ contactoId, dientes: dientesIniciales }: { contactoId: string; dientes: Diente[] }) {
  const [dientes, setDientes] = useState(dientesIniciales);
  const [estado, setEstado] = useState<EstadoDiente>("caries");

  const dienteDe = (numero: number): Diente => dientes.find((d) => d.numero === numero) ?? { numero, zonas: {} };

  async function marcar(numero: number, zona: ZonaDiente) {
    const anterior = dientes;
    const actual = dienteDe(numero);
    const actualizado = { ...actual, zonas: { ...actual.zonas, [zona]: estado } };
    setDientes([...dientes.filter((d) => d.numero !== numero), actualizado]);
    try {
      const respuesta = await fetch(`/api/contactos/${contactoId}/odontograma`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diente: numero, zona, estado }),
      });
      if (!respuesta.ok) throw new Error();
    } catch {
      setDientes(anterior);
      toast("No se pudo guardar el odontograma", "error");
    }
  }

  const arcada = (filas: number[][]) => (
    <div className="flex justify-center gap-2">
      {filas.map((fila, i) => (
        <div key={i} className={`flex gap-1 ${i === 0 ? "border-r-2 border-dashed border-border pr-2" : ""}`}>
          {fila.map((numero) => (
            <Pieza key={numero} diente={dienteDe(numero)} onZona={(zona) => marcar(numero, zona)} />
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ESTADOS_DIENTE) as EstadoDiente[]).map((clave) => (
          <button
            key={clave}
            type="button"
            onClick={() => setEstado(clave)}
            aria-pressed={estado === clave}
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
              estado === clave ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
            ].join(" ")}
          >
            <span className="h-3 w-3 rounded-full border border-slate-400" style={{ background: ESTADOS_DIENTE[clave].color }} />
            {ESTADOS_DIENTE[clave].etiqueta}
          </button>
        ))}
      </div>
      <div className="space-y-3 overflow-x-auto pb-2">
        <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Superior</p>
        {arcada(SUPERIOR)}
        <div className="border-t border-dashed border-border" />
        {arcada(INFERIOR)}
        <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Inferior</p>
      </div>
    </div>
  );
}
