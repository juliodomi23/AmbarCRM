import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { TallerVehiculos } from "@/components/taller/TallerVehiculos";

export const dynamic = "force-dynamic";

export default async function TallerPage({ searchParams }: { searchParams: Promise<{ contactoId?: string }> }) {
  if (!(await moduloActivo("taller"))) redirect("/");
  const [vehiculos, contactos] = await Promise.all([
    db.tallerVehiculo.findMany({ include: { contacto: { select: { id: true, nombre: true, telefono: true } }, ordenes: { select: { estado: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.contacto.findMany({ select: { id: true, nombre: true, telefono: true }, orderBy: { nombre: "asc" }, take: 500 }),
  ]);
  const contactoId = (await searchParams).contactoId ?? "";
  return <TallerVehiculos iniciales={serializar(vehiculos)} contactos={serializar(contactos)} contactoInicial={contactoId} />;
}
