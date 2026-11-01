import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { TallerRecordatorios } from "@/components/taller/TallerRecordatorios";

export const dynamic = "force-dynamic";
export default async function TallerRecordatoriosPage() {
  if (!(await moduloActivo("taller"))) redirect("/");
  const recordatorios = await db.tallerRecordatorio.findMany({ where: { estado: "pendiente" }, include: { vehiculo: { include: { contacto: { select: { nombre: true, telefono: true } } } } }, orderBy: [{ proximaFecha: "asc" }, { proximoKm: "asc" }], take: 500 });
  return <TallerRecordatorios recordatorios={serializar(recordatorios)} esAdmin={(await getSesion())?.user?.rol === "admin"} />;
}
