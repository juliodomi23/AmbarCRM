"use client";

import { useEffect } from "react";
import { almacenIndexedDB, claveIdentidad } from "@/lib/caja-offline/almacen";

/** Marca quién está usando este navegador; el service worker solo sirve el shell de `/caja` de esa persona. */
export function IdentidadOffline({ orgId, userId }: { orgId: string; userId: string }) {
  useEffect(() => {
    void almacenIndexedDB().guardar("meta", "identidadActiva", claveIdentidad({ orgId, userId })).catch(() => undefined);
  }, [orgId, userId]);
  return null;
}

/** Cierre de sesión en equipo compartido: fuera catálogo y shell de esa persona. La cola de ventas NO se borra. */
export async function limpiarCajaLocal(identidad: { orgId: string; userId: string }) {
  const clave = claveIdentidad(identidad);
  try {
    const almacen = almacenIndexedDB();
    await almacen.borrar("meta", "identidadActiva");
    await almacen.borrar("catalogo", clave);
    navigator.serviceWorker?.controller?.postMessage({ tipo: "caja:limpiar", identidad: clave });
  } catch {
    /* sin almacenamiento local: nada que limpiar */
  }
}
