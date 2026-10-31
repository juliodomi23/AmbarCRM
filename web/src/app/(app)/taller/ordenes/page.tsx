import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { TallerOrdenes } from "@/components/taller/TallerOrdenes";

export const dynamic = "force-dynamic";

export default async function TallerOrdenesPage({ searchParams }: { searchParams: Promise<{ vehiculoId?: string }> }) {
  if (!(await moduloActivo("taller"))) redirect("/");
  const [ordenes, vehiculos] = await Promise.all([
    db.tallerOrden.findMany({ include: { vehiculo: { include: { contacto: { select: { nombre: true } } } }, conceptos: true }, orderBy: { updatedAt: "desc" }, take: 300 }),
    db.tallerVehiculo.findMany({ select: { id: true, placa: true, marca: true, modelo: true }, orderBy: { placa: "asc" }, take: 500 }),
  ]);
  return <TallerOrdenes ordenes={serializar(ordenes)} vehiculos={serializar(vehiculos)} vehiculoInicial={(await searchParams).vehiculoId ?? ""} />;
}
