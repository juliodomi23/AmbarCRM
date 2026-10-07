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
