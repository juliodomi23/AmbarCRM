"use client";

import { useState } from "react";
import { BRAND_PRESETS, type BrandPreset } from "@/lib/brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { almacen } from "@/lib/demo/almacen";
import { GIROS, giroPorId } from "@/lib/demo/giros";
import { MODULOS } from "@/lib/modulos-catalogo";
import { irA } from "@/lib/demo/navegacion";
import { restablecerDemo } from "@/lib/demo/persistencia";
import { toast } from "@/components/Toaster";
import { useDatos } from "@/lib/demo/usar-almacen";
import type { GiroId } from "@/lib/demo/tipos";

/** Barra superior de la demo: aviso de datos ficticios, giro, color, tema, recorrido y restablecer. */
export function BarraDemo({ onRecorrido }: { onRecorrido: () => void }) {
  const d = useDatos();
  const [panelModulos, setPanelModulos] = useState(false);
  const clavesGiro = Object.keys(giroPorId(d.giro).modulos);

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
        <button onClick={() => setPanelModulos((x) => !x)} aria-expanded={panelModulos} className="font-bold text-primary hover:underline">
          Módulos
        </button>
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
      {panelModulos && (
        <div role="dialog" aria-label="Módulos del giro" className="fixed right-3 top-11 z-[60] w-72 rounded-xl border bg-card p-3 text-xs shadow-pop">
          <p className="mb-2 font-semibold">Módulos del giro · {giroPorId(d.giro).etiqueta}</p>
          <p className="mb-2 text-muted-foreground">Apágalos y desaparecen del menú. Cada empresa activa solo lo que usa.</p>
          <ul className="space-y-1">
            {clavesGiro.map((clave) => {
              const activo = Boolean(d.modulos[clave]?.activo);
              const nombre = MODULOS.find((m) => m.clave === clave)?.nombre ?? clave;
              return (
                <li key={clave} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-muted">
                  <span>{nombre}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={activo}
                    aria-label={`${activo ? "Apagar" : "Activar"} ${nombre}`}
                    onClick={() => almacen.mutar((x) => void (x.modulos[clave].activo = !activo))}
                    className={`relative h-5 w-9 rounded-full transition ${activo ? "bg-primary" : "bg-muted-foreground/30"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${activo ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
