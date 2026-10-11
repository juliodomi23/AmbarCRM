"use client";

import { EmptyState } from "@/components/EmptyState";
import { EncabezadoPagina } from "@/components/ui";

/** Ruta que la demo todavía no pinta: se queda dentro del marco real en vez de salir al servidor. */
export function PantallaNoDisponible({ ruta }: { ruta: string }) {
  return (
    <div className="space-y-5 p-4 md:p-6">
      <EncabezadoPagina titulo="Disponible en la versión completa" descripcion={`La pantalla ${ruta} aún no forma parte de la demo.`} />
      <div className="surface p-4">
        <EmptyState titulo="Esta pantalla no está en la demo" descripcion="Explora Inicio, Chat, Embudos, Contactos, Tareas y los módulos de tu giro." accion="Volver al inicio" href="/" />
      </div>
    </div>
  );
}
