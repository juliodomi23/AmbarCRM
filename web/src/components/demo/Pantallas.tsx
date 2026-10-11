"use client";

import { PantallaChat } from "./pantallas/Chat";
import { PantallaContactos } from "./pantallas/Contactos";
import { PantallaEmbudos } from "./pantallas/Embudos";
import { PantallaTareas } from "./pantallas/Tareas";
import { PantallaInicio } from "./pantallas/Inicio";
import { PantallaNoDisponible } from "./pantallas/NoDisponible";

/** Mapa ruta → pantalla real de la demo. Cada pantalla arma las props como el page.tsx del CRM. */
export function Pantalla({ ruta }: { ruta: string }) {
  switch (ruta) {
    case "/":
      return <PantallaInicio />;
    case "/chat":
      return <PantallaChat />;
    case "/embudos":
      return <PantallaEmbudos />;
    case "/contactos":
      return <PantallaContactos />;
    case "/tareas":
      return <PantallaTareas />;
    default:
      return <PantallaNoDisponible ruta={ruta} />;
  }
}
