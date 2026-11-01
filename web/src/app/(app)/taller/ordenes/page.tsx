import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { TallerOrdenes } from "@/components/taller/TallerOrdenes";

export const dynamic = "force-dynamic";

export default async function TallerOrdenesPage({ searchParams }: { searchParams: Promise<{ vehiculoId?: string }> }) {
  if (!(await moduloActivo("taller"))) redirect("/");
  const [ordenes, vehiculos, mecanicos] = await Promise.all([
    db.tallerOrden.findMany({ include: { vehiculo: { include: { contacto: { select: { nombre: true, telefono: true } } } }, conceptos: true }, orderBy: { updatedAt: "desc" }, take: 300 }),
    db.tallerVehiculo.findMany({ select: { id: true, placa: true, marca: true, modelo: true, kilometraje: true }, orderBy: { placa: "asc" }, take: 500 }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true, puesto: true }, orderBy: { nombre: "asc" } }),
  ]);
  return <TallerOrdenes ordenes={serializar(ordenes)} vehiculos={serializar(vehiculos)} mecanicos={serializar(mecanicos)} vehiculoInicial={(await searchParams).vehiculoId ?? ""} />;
}
