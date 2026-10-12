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
import { PantallaLegal } from "./pantallas/GiroLegal";
import { PantallaAsesoriasLegales } from "./pantallas/GiroAsesoriasLegales";
import { PantallaFinanzasLegales } from "./pantallas/GiroFinanzasLegales";
import { PantallaOperacionLegal } from "./pantallas/GiroOperacionLegal";
import { PantallaTours } from "./pantallas/GiroTours";
import { PantallaReservasTours } from "./pantallas/GiroReservasTours";
import { PantallaPagosTours } from "./pantallas/GiroPagosTours";
import { PantallaAlumnos } from "./pantallas/GiroAlumnos";
import { PantallaCursosAcademia } from "./pantallas/GiroCursosAcademia";
import { PantallaInscripcionesAcademia } from "./pantallas/GiroInscripcionesAcademia";
import { PantallaColegiaturas } from "./pantallas/GiroColegiaturas";
import { PantallaAsistenciaAcademia } from "./pantallas/GiroAsistenciaAcademia";
import { PantallaLegalDetalle } from "./pantallas/GiroLegalDetalle";
import { PantallaAutomotriz, PantallaInmobiliaria } from "./pantallas/GiroVehiculos";
import { PantallaReservasEnLinea } from "./pantallas/ReservasEnLinea";
import { PantallaChat } from "./pantallas/Chat";
import { PantallaContactos } from "./pantallas/Contactos";
import { PantallaEmbudos } from "./pantallas/Embudos";
import { PantallaTareas } from "./pantallas/Tareas";
import { PantallaInicio } from "./pantallas/Inicio";
import { PantallaNoDisponible } from "./pantallas/NoDisponible";

/** Mapa ruta → pantalla real de la demo. Cada pantalla arma las props como el page.tsx del CRM. */
export function Pantalla({ ruta }: { ruta: string }) {
  const [, base, id] = ruta.split("/");
  if (id && base === "legal") return <PantallaLegalDetalle id={id} />;
  if (id && (base === "pacientes" || base === "clientes")) return <PantallaExpediente modo={base} id={id} />;
  switch (ruta) {
    case "/pacientes":
      return <PantallaFichas modo="pacientes" />;
    case "/clientes":
      return <PantallaFichas modo="clientes" />;
    case "/legal":
      return <PantallaLegal />;
    case "/asesorias-legales":
      return <PantallaAsesoriasLegales />;
    case "/finanzas-legales":
      return <PantallaFinanzasLegales />;
    case "/operacion-legal":
      return <PantallaOperacionLegal />;
    case "/tours":
      return <PantallaTours />;
    case "/reservas-tours":
      return <PantallaReservasTours />;
    case "/pagos-tours":
      return <PantallaPagosTours />;
    case "/alumnos":
      return <PantallaAlumnos />;
    case "/cursos-academia":
      return <PantallaCursosAcademia />;
    case "/inscripciones-academia":
      return <PantallaInscripcionesAcademia />;
    case "/colegiaturas":
      return <PantallaColegiaturas />;
    case "/asistencia-academia":
      return <PantallaAsistenciaAcademia />;
    case "/automotriz":
      return <PantallaAutomotriz />;
    case "/inmobiliaria":
      return <PantallaInmobiliaria />;
    case "/reservas-en-linea":
      return <PantallaReservasEnLinea />;
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
