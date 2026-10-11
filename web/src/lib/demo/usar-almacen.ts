"use client";

import { useSyncExternalStore } from "react";
import { almacen } from "./almacen";
import type { Datos } from "./tipos";

/** Datos del almacén; la pantalla se vuelve a pintar cada vez que cambia (equivale a router.refresh()). */
export function useDatos(): Datos {
  useSyncExternalStore(almacen.suscribir, () => almacen.version, () => 0);
  return almacen.datos;
}
