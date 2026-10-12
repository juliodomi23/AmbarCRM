"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { variablesMarca, type BrandConfig } from "@/lib/brand";
import { instalarCapa } from "@/lib/demo/capa";
import { irA, NavegacionDemo, useNavegacionDemo } from "@/lib/demo/navegacion";
import { cargarPersonalizacion, iniciarPersistencia } from "@/lib/demo/persistencia";
import { useDatos } from "@/lib/demo/usar-almacen";
import { contadoresShell, sesionDemo } from "@/lib/demo/vistas";
import { BarraDemo } from "./BarraDemo";
import { Pantalla } from "./Pantallas";
import { RecorridoDemo } from "./RecorridoDemo";
import { esRutaPublica, VistaPublica } from "./VistasPublicas";

// El AppShell real es h-screen: se le resta el alto de la barra de la demo (solo dentro de la demo).
const CSS = `[data-demo-raiz]{--demo-barra:2.5rem}[data-demo-raiz] .demo-shell>.h-screen{height:calc(100vh - var(--demo-barra));height:calc(100dvh - var(--demo-barra))}`;

function Marco() {
  const d = useDatos();
  const { ruta } = useNavegacionDemo();
  const [recorrido, setRecorrido] = useState<number | null>(0);
  const yo = sesionDemo(d);
  const marca: BrandConfig = { nombre: d.marca.nombre, logo: d.marca.logo, colorPrimario: d.marca.colorPrimario, colorAcento: d.marca.colorAcento, preset: d.marca.preset };
  // El menú lateral lee /api/modulos al montar; al cambiar de giro o de módulos se vuelve a montar.
  const firma = `${d.giro}|${Object.entries(d.modulos).filter(([, m]) => m.activo).map(([k]) => k).join(",")}`;

  return (
    <div data-demo-raiz className="marca-local min-h-screen bg-background text-foreground" style={variablesMarca(marca)}>
      <style>{CSS}</style>
      <BarraDemo onRecorrido={() => setRecorrido((x) => (x ?? 0) + 1)} />
      {esRutaPublica(ruta) ? (
        <div className="min-h-[calc(100vh-var(--demo-barra))] bg-background">
          <div className="flex items-center justify-between gap-3 border-b bg-card px-4 py-2 text-xs">
            <p className="text-muted-foreground">Página pública de ejemplo: así la ve tu cliente (datos ficticios, no sale nada).</p>
            <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : irA("/"))} className="shrink-0 font-bold text-primary hover:underline">
              ← Volver al CRM
            </button>
          </div>
          <VistaPublica ruta={ruta} />
        </div>
      ) : (
      <div className="demo-shell">
        <AppShell key={firma} usuario={{ nombre: yo.nombre, rol: yo.rol }} marca={marca} contadoresIniciales={contadoresShell(d)}>
          <Pantalla ruta={ruta} />
        </AppShell>
      </div>
      )}
      <RecorridoDemo abierto={recorrido} onCerrar={() => setRecorrido(null)} />
    </div>
  );
}

/** Raíz de /demo: instala la capa de red simulada, restaura la personalización y pinta el CRM real. */
export function DemoApp() {
  // Layout effect: la capa existe antes que cualquier useEffect (incluido el del SessionProvider raíz).
  useLayoutEffect(() => instalarCapa(), []);
  const [listo, setListo] = useState(false);
  useEffect(() => {
    cargarPersonalizacion();
    setListo(true);
    return iniciarPersistencia();
  }, []);

  if (!listo) return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Cargando demo…</div>;
  return (
    <NavegacionDemo>
      <Marco />
    </NavegacionDemo>
  );
}
