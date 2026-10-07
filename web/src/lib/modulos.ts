import { db } from "@/lib/db";

export const MODULOS = [
  { clave: "citas", nombre: "Citas", descripcion: "Agenda, seguimiento y recordatorios de citas.", icono: "M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", ruta: "/citas" }
] as const;

export type ClaveModulo = (typeof MODULOS)[number]["clave"];

export function moduloPorClave(clave: string) {
  return MODULOS.find((modulo) => modulo.clave === clave);
}

/** Se usa dentro de rutas y servicios: RLS limita siempre a la organización actual. */
export async function moduloActivo(clave: ClaveModulo) {
  return Boolean(await db.moduloOrg.findFirst({ where: { clave, activo: true }, select: { id: true } }));
}

export async function requireModuloActivo(clave: ClaveModulo) {
  return (await moduloActivo(clave)) ? null : new Response(JSON.stringify({ error: "módulo no activo" }), { status: 404, headers: { "Content-Type": "application/json" } });
}
