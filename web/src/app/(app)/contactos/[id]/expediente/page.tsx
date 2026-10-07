import { notFound, redirect } from "next/navigation";
import { ExpedienteCliente } from "@/components/contactos/ExpedienteCliente";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function ExpedientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await moduloActivo("citas"))) redirect("/contactos");
  const id = aBigInt((await params).id);
  if (id === null) notFound();
  const [contacto, doctores, citas] = await Promise.all([
    db.contacto.findUnique({
      where: { id },
      include: {
        expediente: {
          include: {
            evoluciones: {
              include: { doctor: true, cita: true, registradoPor: true },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    }),
    db.doctor.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    db.cita.findMany({
      where: { contactoId: id },
      include: { doctor: true },
      orderBy: { inicio: "desc" },
      take: 20,
    }),
  ]);
  if (!contacto) notFound();
  return (
    <ExpedienteCliente
      contacto={serializar(contacto)}
      doctores={serializar(doctores)}
      citas={serializar(citas)}
    />
  );
}
