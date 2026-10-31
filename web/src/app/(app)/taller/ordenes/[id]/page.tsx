import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";
import { TallerOrdenDetalle } from "@/components/taller/TallerOrdenDetalle";

export const dynamic = "force-dynamic";
export default async function TallerOrdenPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await moduloActivo("taller"))) redirect("/");
  const id = aBigInt((await params).id); if (!id) notFound();
  const orden = await db.tallerOrden.findUnique({ where: { id }, include: { vehiculo: { include: { contacto: true } }, conceptos: true, cambios: { orderBy: { creadoAt: "asc" } }, fotos: { orderBy: { createdAt: "desc" } } } });
  if (!orden) notFound();
  return <TallerOrdenDetalle orden={serializar(orden)} />;
}
