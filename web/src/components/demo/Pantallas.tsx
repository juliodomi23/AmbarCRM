"use client";

import { PantallaCaja } from "./pantallas/Caja";
import { PantallaCitas } from "./pantallas/Citas";
import { PantallaConfiguracion } from "./pantallas/Configuracion";
import { PantallaCotizaciones } from "./pantallas/Cotizaciones";
import { PantallaPedidos } from "./pantallas/Pedidos";
import { PantallaProductos } from "./pantallas/Productos";
import { PantallaExpediente, PantallaFichas } from "./pantallas/Fichas";
import { PantallaCompras, PantallaPrecios, PantallaReportesRetail, PantallaVentas } from "./pantallas/RetailVentas";
import { PantallaDifusion, PantallaPersonal } from "./pantallas/Gestion";
import { PantallaLealtad } from "./pantallas/Lealtad";
import { PantallaResenas } from "./pantallas/Resenas";
import { PantallaChat } from "./pantallas/Chat";
import { PantallaContactos } from "./pantallas/Contactos";
import { PantallaEmbudos } from "./pantallas/Embudos";
import { PantallaTareas } from "./pantallas/Tareas";
import { PantallaInicio } from "./pantallas/Inicio";
import { PantallaNoDisponible } from "./pantallas/NoDisponible";

/** Mapa ruta → pantalla real de la demo. Cada pantalla arma las props como el page.tsx del CRM. */
export function Pantalla({ ruta }: { ruta: string }) {
  const [, base, id] = ruta.split("/");
  if (id && (base === "pacientes" || base === "clientes")) return <PantallaExpediente modo={base} id={id} />;
  switch (ruta) {
    case "/pacientes":
      return <PantallaFichas modo="pacientes" />;
    case "/clientes":
      return <PantallaFichas modo="clientes" />;
    case "/resenas":
      return <PantallaResenas />;
    case "/lealtad":
      return <PantallaLealtad />;
    case "/difusion":
      return <PantallaDifusion />;
    case "/personal":
      return <PantallaPersonal />;
    case "/ventas":
      return <PantallaVentas />;
    case "/compras":
      return <PantallaCompras />;
    case "/productos/precios":
      return <PantallaPrecios />;
    case "/reportes-retail":
      return <PantallaReportesRetail />;
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
