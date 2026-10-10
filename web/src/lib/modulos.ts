import { db } from "@/lib/db";

const ACCESO_TODOS = { puestosPorDefecto: [] } as const;
const ACCESO_CLINICO = {
  puestosPorDefecto: ["Administrador", "Doctor", "Coordinador clínico"],
} as const;
const ACCESO_LEGAL = {
  puestosPorDefecto: ["Administrador", "Abogado", "Coordinador jurídico", "Pasante"],
} as const;

export const MODULOS = [
  {
    clave: "clientes",
    area: "CRM y agenda",
    nombre: "Clientes",
    descripcion: "Ficha de servicio, preferencias e historial de cada cliente.",
    acceso: ACCESO_TODOS,
    icono:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6m3-3h-6",
    ruta: "/clientes",
  },
  {
    clave: "pacientes",
    area: "Clínica",
    nombre: "Pacientes",
    descripcion: "Expediente clínico, alergias y seguimiento de pacientes.",
    acceso: ACCESO_CLINICO,
    icono:
      "M12 21s-7-4.35-7-10A4 4 0 0 1 12 8a4 4 0 0 1 7 3c0 5.65-7 10-7 10zM9 12h6m-3-3v6",
    ruta: "/pacientes",
  },
  {
    clave: "citas",
    area: "CRM y agenda",
    nombre: "Citas",
    descripcion: "Agenda, seguimiento y recordatorios de citas.",
    acceso: ACCESO_TODOS,
    icono:
      "M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
    ruta: "/citas",
  },
  {
    clave: "reservas_en_linea",
    area: "CRM y agenda",
    nombre: "Reservas en línea",
    descripcion: "Link público para que tus clientes agenden solos con disponibilidad real.",
    acceso: ACCESO_TODOS,
    icono:
      "M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm4 10l2 2 4-4",
    ruta: "/reservas-en-linea",
  },
  {
    clave: "resenas",
    area: "CRM y agenda",
    nombre: "Reseñas de Google",
    descripcion: "Opiniones por QR con salto a Google, promedio, tendencia y solicitud automática por WhatsApp.",
    acceso: ACCESO_TODOS,
    icono: "M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.1l1.5-7L2 9.3l7-.8L12 2z",
    ruta: "/resenas",
  },
  {
    clave: "lealtad",
    area: "CRM y agenda",
    nombre: "Lealtad",
    descripcion: "Tarjetas de sellos de Aurum: sellos, premios y avisos por WhatsApp.",
    acceso: ACCESO_TODOS,
    icono:
      "M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.1l1.5-7L2 9.3l7-.8L12 2z",
    ruta: "/lealtad",
  },
  {
    clave: "cotizaciones",
    area: "CRM y agenda",
    nombre: "Cotizaciones",
    descripcion: "Propuestas con vigencia, aceptación pública y conversión opcional en venta.",
    acceso: ACCESO_TODOS,
    icono: "M5 3h14v18H5zM8 8h8M8 12h8M8 16h5M15 18l2 2 4-4",
    ruta: "/cotizaciones",
  },
  {
    clave: "automotriz",
    area: "Automotriz",
    nombre: "Automotriz",
    descripcion: "Inventario de vehículos, disponibilidad y seguimiento comercial.",
    acceso: ACCESO_TODOS,
    icono:
      "M3 17h18M5 17l1-6h12l1 6M8 17v2m8-2v2M7 11l2-4h6l2 4M7 14h.01M17 14h.01",
    ruta: "/automotriz",
  },
  {
    clave: "inmobiliaria",
    area: "Inmobiliaria",
    nombre: "Inmobiliaria",
    descripcion: "Catálogo de propiedades, disponibilidad y citas de visita.",
    acceso: ACCESO_TODOS,
    icono: "M3 11l9-8 9 8M5 10v10h14V10M9 20v-6h6v6",
    ruta: "/inmobiliaria",
  },
  {
    clave: "productos",
    area: "Retail y comercio",
    nombre: "Productos e inventario",
    descripcion: "Catálogo, existencias, alertas de stock y movimientos.",
    acceso: ACCESO_TODOS,
    icono: "M4 7l8-4 8 4-8 4-8-4zm0 0v10l8 4 8-4V7M12 11v10",
    ruta: "/productos",
  },
  {
    clave: "compras",
    area: "Retail y comercio",
    nombre: "Compras y proveedores",
    descripcion: "Proveedores, órdenes de compra y recepción de mercancía.",
    acceso: ACCESO_TODOS,
    icono: "M4 7h16l-1 13H5L4 7zm3 0V5a5 5 0 0 1 10 0v2M8 11h8",
    ruta: "/compras",
  },
  {
    clave: "ventas",
    area: "Retail y comercio",
    nombre: "Ventas y pedidos",
    descripcion: "Pedidos de mostrador, WhatsApp y tienda en línea.",
    acceso: ACCESO_TODOS,
    icono: "M3 3h2l2 12h10l2-8H6M9 20h.01M17 20h.01",
    ruta: "/ventas",
  },
  {
    clave: "pedidos_en_linea",
    area: "Retail y comercio",
    nombre: "Pedidos en línea",
    descripcion: "Catálogo público, carrito, reservas de existencia y seguimiento de pedidos.",
    acceso: ACCESO_TODOS,
    icono: "M3 5h18v14H3zM7 9h10M7 13h6M17 16h.01M7 16h4",
    ruta: "/pedidos-en-linea",
  },
  {
    clave: "caja",
    area: "Retail y comercio",
    nombre: "Caja de mostrador",
    descripcion: "Cobro rápido, turnos, movimientos de efectivo y cortes X/Z.",
    acceso: { puestosPorDefecto: ["Cajero", "Encargado de tienda"] },
    icono: "M3 6h18v14H3zM3 10h18M7 15h4m6 0h.01M7 3h10v3",
    ruta: "/caja",
  },
  {
    clave: "legal",
    area: "Legal",
    nombre: "Expedientes legales",
    descripcion: "Asuntos, actuaciones, audiencias, términos y documentos.",
    acceso: ACCESO_LEGAL,
    icono: "M12 3v18M5 7h14M7 7l-4 7h8L7 7zm10 0-4 7h8l-4-7M8 21h8",
    ruta: "/legal",
  },
  {
    clave: "asesorias_legales",
    area: "Legal",
    nombre: "Asesorías legales",
    descripcion: "Consultas, seguimiento, conversión y responsables.",
    acceso: ACCESO_LEGAL,
    icono: "M8 10h8M8 14h5M5 4h14v16H5z",
    ruta: "/asesorias-legales",
  },
  {
    clave: "finanzas_legales",
    area: "Legal",
    nombre: "Honorarios y caja",
    descripcion: "Planes de pago, cobros, gastos y movimientos del despacho.",
    acceso: ACCESO_LEGAL,
    icono: "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
    ruta: "/finanzas-legales",
  },
  {
    clave: "operacion_legal",
    area: "Legal",
    nombre: "Operación del despacho",
    descripcion: "Sucursales, productividad, asistencia y actividad del equipo.",
    acceso: ACCESO_LEGAL,
    icono: "M4 21V10l8-7 8 7v11M9 21v-6h6v6M8 11h.01M16 11h.01",
    ruta: "/operacion-legal",
  },
  {
    clave: "tours",
    area: "Viajes y tours",
    nombre: "Tours y salidas",
    descripcion: "Catálogo, itinerarios, fechas, cupo y precio de cada experiencia.",
    acceso: ACCESO_TODOS,
    icono: "M3 17l6-6 4 4 8-10M5 19h14M16 5h5v5M21 5l-8 8",
    ruta: "/tours",
  },
  {
    clave: "reservas_tours",
    area: "Viajes y tours",
    nombre: "Reservas y viajeros",
    descripcion: "Apartados, pasajeros, confirmación, salida y saldo pendiente.",
    acceso: ACCESO_TODOS,
    icono: "M4 5h16v14H4zM8 3v4m8-4v4M7 11h10M8 15h3",
    ruta: "/reservas-tours",
  },
  {
    clave: "pagos_tours",
    area: "Viajes y tours",
    nombre: "Cobranza de viajes",
    descripcion: "Anticipos, liquidaciones, referencias y saldos de reservaciones.",
    acceso: ACCESO_TODOS,
    icono: "M3 7h18v12H3zM3 11h18M7 16h4",
    ruta: "/pagos-tours",
  },
  {
    clave: "alumnos",
    area: "Educación y academias",
    nombre: "Alumnos",
    descripcion: "Ficha, matrícula, tutor, nivel e historial de cada alumno.",
    acceso: ACCESO_TODOS,
    icono: "M3 10l9-5 9 5-9 5-9-5M7 12v5c3 2 7 2 10 0v-5",
    ruta: "/alumnos",
  },
  {
    clave: "cursos_academia",
    area: "Educación y academias",
    nombre: "Cursos y grupos",
    descripcion: "Oferta académica, profesores, horarios, cupo y mensualidad.",
    acceso: ACCESO_TODOS,
    icono: "M4 5h16v14H4zM8 9h8M8 13h8M8 17h5",
    ruta: "/cursos-academia",
  },
  {
    clave: "inscripciones_academia",
    area: "Educación y academias",
    nombre: "Inscripciones",
    descripcion: "Altas, bajas, avance y relación de alumnos con sus cursos.",
    acceso: ACCESO_TODOS,
    icono: "M9 11l3 3 8-8M5 4h10v4M5 4v16h14v-8",
    ruta: "/inscripciones-academia",
  },
  {
    clave: "colegiaturas",
    area: "Educación y academias",
    nombre: "Colegiaturas",
    descripcion: "Cargos, vencimientos, pagos y cartera pendiente.",
    acceso: ACCESO_TODOS,
    icono: "M12 2v20M17 6H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H6",
    ruta: "/colegiaturas",
  },
  {
    clave: "asistencia_academia",
    area: "Educación y academias",
    nombre: "Asistencia",
    descripcion: "Pase de lista por curso, faltas, retardos y justificaciones.",
    acceso: ACCESO_TODOS,
    icono: "M9 11l3 3 8-8M4 5h11M4 10h4M4 15h4M4 20h15",
    ruta: "/asistencia-academia",
  },
] as const;

export type ClaveModulo = (typeof MODULOS)[number]["clave"];

export function moduloPorClave(clave: string) {
  return MODULOS.find((modulo) => modulo.clave === clave);
}

type ConfigModulo = { puestosPermitidos?: unknown };

export function puestosPermitidosModulo(clave: ClaveModulo, config: unknown) {
  const configurados = (config as ConfigModulo | null)?.puestosPermitidos;
  if (Array.isArray(configurados)) {
    return configurados
      .filter((puesto): puesto is string => typeof puesto === "string")
      .map((puesto) => puesto.trim())
      .filter(Boolean);
  }
  return [...(moduloPorClave(clave)?.acceso.puestosPorDefecto ?? [])];
}

export function puestoPuedeAcceder(
  clave: ClaveModulo,
  config: unknown,
  puesto?: string,
  rol?: string,
) {
  if (rol === "admin") return true;
  const permitidos = puestosPermitidosModulo(clave, config);
  if (permitidos.length === 0) return true;
  const actual = String(puesto ?? "").trim().toLocaleLowerCase("es-MX");
  return permitidos.some(
    (permitido) => permitido.toLocaleLowerCase("es-MX") === actual,
  );
}

/** Se usa dentro de rutas y servicios: RLS limita siempre a la organización actual. */
export async function moduloActivo(clave: ClaveModulo) {
  const modulo = await db.moduloOrg.findFirst({
    where: { clave, activo: true },
    select: { config: true },
  });
  if (!modulo) return false;
  const { getSesion } = await import("@/lib/session");
  const sesion = await getSesion();
  if (!sesion?.user) return true;
  return puestoPuedeAcceder(
    clave,
    modulo.config,
    sesion.user.puesto,
    sesion.user.rol,
  );
}

export async function moduloHabilitado(clave: ClaveModulo) {
  return Boolean(
    await db.moduloOrg.findFirst({
      where: { clave, activo: true },
      select: { id: true },
    }),
  );
}

export async function requireModuloActivo(
  clave: ClaveModulo,
  sesionActual?: { rol?: string; puesto?: string },
) {
  const modulo = await db.moduloOrg.findFirst({
    where: { clave, activo: true },
    select: { config: true },
  });
  if (!modulo) {
    return Response.json({ error: "módulo no activo" }, { status: 404 });
  }
  const sesion = sesionActual
    ? { user: sesionActual }
    : await (await import("@/lib/session")).getSesion();
  if (
    sesion?.user &&
    !puestoPuedeAcceder(
      clave,
      modulo.config,
      sesion.user.puesto,
      sesion.user.rol,
    )
  ) {
    return Response.json({ error: "puesto sin acceso al módulo" }, { status: 403 });
  }
  return null;
}
