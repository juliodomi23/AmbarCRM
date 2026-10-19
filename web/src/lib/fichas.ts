import { db } from "@/lib/db";
import { fechaValida } from "@/lib/reservas/horarios";

export function fechaNacimientoFicha(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor !== "string" || !fechaValida(valor) || valor > new Date().toISOString().slice(0, 10)) return undefined;
  return new Date(`${valor}T00:00:00.000Z`);
}

export async function contactosSinFicha(q: string) {
  const telefono = q.replace(/\D/g, "");
  const contactos = await db.contacto.findMany({
    where: { expediente: { is: null }, ...(q ? { OR: [
      { nombre: { contains: q, mode: "insensitive" as const } },
      ...(telefono.length >= 3 ? [{ telefono: { contains: telefono } }] : []),
    ] } : {}) },
    select: { id: true, nombre: true, telefono: true, email: true },
    orderBy: [{ nombre: "asc" }, { id: "asc" }], take: 31,
  });
  return { contactos: contactos.slice(0, 30), hayMas: contactos.length > 30 };
}
