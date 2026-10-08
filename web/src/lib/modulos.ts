import { db } from "@/lib/db";

export const MODULOS = [
  {
    clave: "clientes",
    nombre: "Clientes",
    descripcion: "Ficha de servicio, preferencias e historial de cada cliente.",
    icono:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6m3-3h-6",
    ruta: "/clientes",
  },
  {
    clave: "pacientes",
    nombre: "Pacientes",
    descripcion: "Expediente clínico, alergias y seguimiento de pacientes.",
    icono:
      "M12 21s-7-4.35-7-10A4 4 0 0 1 12 8a4 4 0 0 1 7 3c0 5.65-7 10-7 10zM9 12h6m-3-3v6",
    ruta: "/pacientes",
  },
  {
    clave: "citas",
    nombre: "Citas",
    descripcion: "Agenda, seguimiento y recordatorios de citas.",
    icono:
      "M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
    ruta: "/citas",
  },
  {
    clave: "automotriz",
    nombre: "Automotriz",
    descripcion: "Inventario de vehículos, disponibilidad y seguimiento comercial.",
    icono:
      "M3 17h18M5 17l1-6h12l1 6M8 17v2m8-2v2M7 11l2-4h6l2 4M7 14h.01M17 14h.01",
    ruta: "/automotriz",
  },
  {
    clave: "inmobiliaria",
    nombre: "Inmobiliaria",
    descripcion: "Catálogo de propiedades, disponibilidad y citas de visita.",
    icono: "M3 11l9-8 9 8M5 10v10h14V10M9 20v-6h6v6",
    ruta: "/inmobiliaria",
  },
  {
    clave: "productos",
    nombre: "Productos e inventario",
    descripcion: "Catálogo, existencias, alertas de stock y movimientos.",
    icono: "M4 7l8-4 8 4-8 4-8-4zm0 0v10l8 4 8-4V7M12 11v10",
    ruta: "/productos",
  },
  {
    clave: "compras",
    nombre: "Compras y proveedores",
    descripcion: "Proveedores, órdenes de compra y recepción de mercancía.",
    icono: "M4 7h16l-1 13H5L4 7zm3 0V5a5 5 0 0 1 10 0v2M8 11h8",
    ruta: "/compras",
  },
  {
    clave: "ventas",
    nombre: "Ventas y pedidos",
    descripcion: "Pedidos de mostrador, WhatsApp y tienda en línea.",
    icono: "M3 3h2l2 12h10l2-8H6M9 20h.01M17 20h.01",
    ruta: "/ventas",
  },
  {
    clave: "legal",
    nombre: "Expedientes legales",
    descripcion: "Asuntos, actuaciones, audiencias, términos y documentos.",
    icono: "M12 3v18M5 7h14M7 7l-4 7h8L7 7zm10 0-4 7h8l-4-7M8 21h8",
    ruta: "/legal",
  },
  {
    clave: "asesorias_legales",
    nombre: "Asesorías legales",
    descripcion: "Consultas, seguimiento, conversión y responsables.",
    icono: "M8 10h8M8 14h5M5 4h14v16H5z",
    ruta: "/asesorias-legales",
  },
  {
    clave: "finanzas_legales",
    nombre: "Honorarios y caja",
    descripcion: "Planes de pago, cobros, gastos y movimientos del despacho.",
    icono: "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
    ruta: "/finanzas-legales",
  },
  {
    clave: "operacion_legal",
    nombre: "Operación del despacho",
    descripcion: "Sucursales, productividad, asistencia y actividad del equipo.",
    icono: "M4 21V10l8-7 8 7v11M9 21v-6h6v6M8 11h.01M16 11h.01",
    ruta: "/operacion-legal",
  },
] as const;

export type ClaveModulo = (typeof MODULOS)[number]["clave"];

export function moduloPorClave(clave: string) {
  return MODULOS.find((modulo) => modulo.clave === clave);
}

/** Se usa dentro de rutas y servicios: RLS limita siempre a la organización actual. */
export async function moduloActivo(clave: ClaveModulo) {
  return Boolean(
    await db.moduloOrg.findFirst({
      where: { clave, activo: true },
      select: { id: true },
    }),
  );
}

export async function requireModuloActivo(clave: ClaveModulo) {
  return (await moduloActivo(clave))
    ? null
    : new Response(JSON.stringify({ error: "módulo no activo" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
}
