import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";
import { TallerOrdenDetalle } from "@/components/taller/TallerOrdenDetalle";
import { getSesion } from "@/lib/session";

export const dynamic = "force-dynamic";
export default async function TallerOrdenPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await moduloActivo("taller"))) redirect("/");
  const id = aBigInt((await params).id); if (!id) notFound();
  const [orden, refacciones, mecanicos, sesion] = await Promise.all([
    db.tallerOrden.findUnique({ where: { id }, include: { vehiculo: { include: { contacto: true } }, conceptos: true, cambios: { orderBy: { creadoAt: "asc" } }, fotos: { orderBy: { createdAt: "desc" } }, pagos: { orderBy: { createdAt: "asc" } }, notificaciones: { orderBy: { createdAt: "desc" }, take: 20 } } }),
    db.tallerRefaccion.findMany({ orderBy: { nombre: "asc" }, take: 500 }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true, puesto: true }, orderBy: { nombre: "asc" } }),
    getSesion(),
  ]);
  if (!orden) notFound();
  const rutaAprobacion = orden.aprobacionToken && sesion?.user?.orgId ? `/taller-aprobacion/${sesion.user.orgId}-${orden.aprobacionToken}` : "";
  return <TallerOrdenDetalle orden={serializar(orden)} refacciones={serializar(refacciones)} mecanicos={serializar(mecanicos)} esAdmin={sesion?.user?.rol === "admin"} rutaAprobacion={rutaAprobacion} />;
}
