"use client";

import { PantallaChat } from "./pantallas/Chat";
import { PantallaInicio } from "./pantallas/Inicio";
import { PantallaNoDisponible } from "./pantallas/NoDisponible";

/** Mapa ruta → pantalla real de la demo. Cada pantalla arma las props como el page.tsx del CRM. */
export function Pantalla({ ruta }: { ruta: string }) {
  switch (ruta) {
    case "/":
      return <PantallaInicio />;
    case "/chat":
      return <PantallaChat />;
    default:
      return <PantallaNoDisponible ruta={ruta} />;
  }
}
