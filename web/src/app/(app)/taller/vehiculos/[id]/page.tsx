import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { TallerVehiculoDetalle } from "@/components/taller/TallerVehiculoDetalle";

export const dynamic = "force-dynamic";

export default async function TallerVehiculoPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await moduloActivo("taller"))) redirect("/");
  const id = aBigInt((await params).id);
  if (!id) notFound();
  const vehiculo = await db.tallerVehiculo.findUnique({ where: { id }, include: { contacto: true, ordenes: { orderBy: { createdAt: "desc" }, take: 100 }, recordatorios: { where: { estado: "pendiente" }, orderBy: [{ proximaFecha: "asc" }, { proximoKm: "asc" }], take: 3 } } });
  if (!vehiculo) notFound();
  return <TallerVehiculoDetalle vehiculo={serializar(vehiculo)} esAdmin={(await getSesion())?.user?.rol === "admin"} />;
}
