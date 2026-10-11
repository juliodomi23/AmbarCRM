"use client";

import { useEffect, useRef, useState } from "react";
import { useDatos } from "@/lib/demo/usar-almacen";
import { irA, useNavegacionDemo } from "@/lib/demo/navegacion";
import { pasosRecorrido } from "@/lib/demo/recorrido";

/** Tarjeta flotante del recorrido guiado: cada paso lleva a una pantalla real. */
export function RecorridoDemo({ abierto, onCerrar }: { abierto: number | null; onCerrar: () => void }) {
  const d = useDatos();
  const { ruta } = useNavegacionDemo();
  const pasos = pasosRecorrido(d);
  const [paso, setPaso] = useState(0);
  const primera = useRef(true);

  // Al reiniciar el recorrido vuelve al primer paso; la primera vez respeta la ruta con la que se abrió /demo.
  useEffect(() => {
    if (abierto == null) return;
    setPaso(0);
    if (primera.current) primera.current = false;
    else irA(pasos[0].ruta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  if (abierto == null || !pasos[paso]) return null;
  const actual = pasos[paso];

  function mover(direccion: 1 | -1) {
    const siguiente = paso + direccion;
    if (siguiente >= pasos.length) return onCerrar();
    const valido = Math.max(0, siguiente);
    setPaso(valido);
    irA(pasos[valido].ruta);
  }

  return (
    <section
      aria-live="polite"
      aria-label="Recorrido guiado"
      className="fixed inset-x-3 bottom-20 z-[45] mx-auto max-w-xl rounded-2xl border border-primary/20 bg-card/95 p-4 shadow-pop backdrop-blur md:bottom-5 md:left-auto md:right-5 md:mx-0"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">{paso + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[.15em] text-primary">
              Recorrido · {paso + 1} de {pasos.length}
            </p>
            <button onClick={onCerrar} aria-label="Cerrar recorrido" className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
              ✕
            </button>
          </div>
          <h2 className="mt-1 font-bold">{actual.titulo}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{actual.descripcion}</p>
          {ruta !== actual.ruta && (
            <button onClick={() => irA(actual.ruta)} className="mt-1 text-xs font-semibold text-primary hover:underline">
              Volver a esta pantalla
            </button>
          )}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-1">
              {pasos.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === paso ? "w-6 bg-primary" : "w-1.5 bg-muted"}`} />
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => mover(-1)} disabled={paso === 0} className="min-h-9 rounded-lg border px-3 text-xs font-semibold disabled:opacity-40">
                Atrás
              </button>
              <button onClick={() => mover(1)} className="min-h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">
                {paso === pasos.length - 1 ? "Terminar" : "Siguiente"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
