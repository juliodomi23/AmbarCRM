// Personalización que la demo recuerda entre visitas (solo en este navegador): giro, marca y módulos.
// Los datos del almacén (mensajes, tareas…) viven únicamente en memoria y se pierden al recargar.
import { BRAND_PRESETS, type BrandPreset } from "@/lib/brand";
import { almacen } from "./almacen";
import { GIRO_INICIAL, GIROS } from "./giros";
import type { GiroId } from "./tipos";

const CLAVE = "ambar-demo-personalizacion";

type Guardado = {
  giro?: string;
  marca?: { nombre?: string; preset?: string; colorPrimario?: string; colorAcento?: string };
  modulos?: Record<string, boolean>;
};

const leer = (): Guardado | null => {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    return crudo ? (JSON.parse(crudo) as Guardado) : null;
  } catch {
    return null;
  }
};

/** Aplica lo guardado al almacén (se llama una vez al abrir /demo). */
export function cargarPersonalizacion() {
  const g = leer();
  if (!g) return;
  const giro = GIROS.find((x) => x.id === g.giro)?.id as GiroId | undefined;
  if (giro && giro !== almacen.datos.giro) almacen.reiniciar(giro);
  almacen.mutar((d) => {
    if (g.marca) {
      if (typeof g.marca.nombre === "string") d.marca.nombre = g.marca.nombre.slice(0, 40);
      if (g.marca.preset && g.marca.preset in BRAND_PRESETS) d.marca.preset = g.marca.preset as BrandPreset;
      if (/^#[0-9a-f]{6}$/i.test(g.marca.colorPrimario ?? "")) d.marca.colorPrimario = g.marca.colorPrimario!;
      if (/^#[0-9a-f]{6}$/i.test(g.marca.colorAcento ?? "")) d.marca.colorAcento = g.marca.colorAcento!;
    }
    for (const [clave, activo] of Object.entries(g.modulos ?? {})) {
      if (d.modulos[clave] && typeof activo === "boolean") d.modulos[clave].activo = activo;
    }
  });
}

/** Guarda la personalización cuando cambia. Devuelve la función que deja de escuchar. */
export function iniciarPersistencia() {
  return almacen.suscribir(() => {
    const d = almacen.datos;
    const { nombre, preset, colorPrimario, colorAcento } = d.marca;
    try {
      window.localStorage.setItem(
        CLAVE,
        JSON.stringify({
          giro: d.giro,
          marca: { nombre, preset, colorPrimario, colorAcento },
          modulos: Object.fromEntries(Object.entries(d.modulos).map(([k, m]) => [k, m.activo])),
        } satisfies Guardado),
      );
    } catch {
      // La demo sigue funcionando aunque el navegador bloquee el almacenamiento local.
    }
  });
}

/** «Restablecer demo»: borra lo guardado y vuelve al giro y datos iniciales. */
export function restablecerDemo() {
  try {
    window.localStorage.removeItem(CLAVE);
  } catch {
    // sin almacenamiento: el estado en memoria igual se restablece
  }
  almacen.reiniciar(GIRO_INICIAL);
}
