"use client";

import { BRAND_PRESETS, type BrandPreset } from "@/lib/brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { almacen } from "@/lib/demo/almacen";
import { GIROS } from "@/lib/demo/giros";
import { irA } from "@/lib/demo/navegacion";
import { restablecerDemo } from "@/lib/demo/persistencia";
import { toast } from "@/components/Toaster";
import { useDatos } from "@/lib/demo/usar-almacen";
import type { GiroId } from "@/lib/demo/tipos";

/** Barra superior de la demo: aviso de datos ficticios, giro, color, tema, recorrido y restablecer. */
export function BarraDemo({ onRecorrido }: { onRecorrido: () => void }) {
  const d = useDatos();

  function cambiarGiro(giro: GiroId) {
    almacen.reiniciar(giro);
    irA("/");
  }
  function cambiarColor(clave: BrandPreset) {
    const p = BRAND_PRESETS[clave];
    almacen.mutar((x) => void Object.assign(x.marca, { preset: clave, colorPrimario: p.primario, colorAcento: p.acento }));
  }
  function restablecer() {
    restablecerDemo();
    irA("/", true);
    toast("La demo volvió a su configuración inicial.");
  }

  return (
    <div
      data-demo-barra
      className="flex h-10 items-center gap-3 overflow-x-auto whitespace-nowrap border-b bg-primary/5 px-3 text-xs sm:px-4"
    >
      <p className="flex shrink-0 items-center gap-2 font-semibold">
        <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
        <span className="hidden sm:inline">Entorno seguro · datos 100 % ficticios</span>
        <span className="sm:hidden">Demo · datos ficticios</span>
      </p>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <label className="flex items-center gap-1.5 font-semibold">
          <span className="hidden md:inline">Giro</span>
          <select
            aria-label="Giro del negocio"
            value={d.giro}
            onChange={(e) => cambiarGiro(e.target.value as GiroId)}
            className="h-7 rounded-lg border border-input bg-background px-2 text-xs font-medium"
          >
            {GIROS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1" role="group" aria-label="Color de marca">
          {(Object.keys(BRAND_PRESETS) as BrandPreset[]).map((clave) => (
            <button
              key={clave}
              type="button"
              onClick={() => cambiarColor(clave)}
              title={BRAND_PRESETS[clave].nombre}
              aria-label={`Color de marca: ${BRAND_PRESETS[clave].nombre}`}
              aria-pressed={d.marca.preset === clave}
              className={`h-5 w-5 rounded-full border-2 transition hover:scale-110 ${d.marca.preset === clave ? "border-foreground" : "border-transparent"}`}
              style={{ background: `linear-gradient(135deg, ${BRAND_PRESETS[clave].primario}, ${BRAND_PRESETS[clave].acento})` }}
            />
          ))}
        </div>
        <div className="w-10 shrink-0">
          <ThemeToggle compact />
        </div>
        <button onClick={onRecorrido} className="font-bold text-primary hover:underline">
          Recorrido
        </button>
        <button onClick={restablecer} className="font-bold text-primary hover:underline">
          Restablecer demo
        </button>
        <a href="/login" data-demo-salir className="font-bold text-primary hover:underline">
          Ir al acceso real
        </a>
      </div>
    </div>
  );
}
