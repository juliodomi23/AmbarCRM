"use client";

import { PantallaCaja } from "./pantallas/Caja";
import { PantallaCitas } from "./pantallas/Citas";
import { PantallaConfiguracion } from "./pantallas/Configuracion";
import { PantallaCotizaciones } from "./pantallas/Cotizaciones";
import { PantallaPedidos } from "./pantallas/Pedidos";
import { PantallaProductos } from "./pantallas/Productos";
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
    case "/citas":
      return <PantallaCitas />;
    case "/caja":
      return <PantallaCaja />;
    case "/productos":
      return <PantallaProductos />;
    case "/cotizaciones":
      return <PantallaCotizaciones />;
    case "/pedidos-en-linea":
      return <PantallaPedidos />;
    case "/configuracion":
      return <PantallaConfiguracion />;
    default:
      return <PantallaNoDisponible ruta={ruta} />;
  }
}
