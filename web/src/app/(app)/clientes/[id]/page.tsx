import { notFound, redirect } from "next/navigation";
import { ExpedienteCliente } from "@/components/contactos/ExpedienteCliente";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { moduloActivo, moduloHabilitado } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function ClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await moduloActivo("clientes"))) redirect("/");
  const id = aBigInt((await params).id);
  if (id === null) notFound();
  const [pacientesHabilitado, pacientesAccesible] = await Promise.all([
    moduloHabilitado("pacientes"),
    moduloActivo("pacientes"),
  ]);
  const soloBasico = pacientesHabilitado && !pacientesAccesible;
  const [contacto, doctores, citas, citasActivo] = await Promise.all([
    soloBasico
      ? db.contacto.findUnique({ where: { id } })
      : db.contacto.findFirst({
          where: { id, expediente: { isNot: null } },
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
    soloBasico
      ? Promise.resolve([])
      : db.doctor.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    db.cita.findMany({
      where: { contactoId: id },
      include: { doctor: true },
      orderBy: { inicio: "desc" },
      take: 20,
    }),
    moduloActivo("citas"),
  ]);
  if (!contacto) notFound();
  return (
    <ExpedienteCliente
      contacto={serializar(contacto)}
      doctores={serializar(doctores)}
      citas={serializar(citas)}
      citasActivo={citasActivo}
      modo="clientes"
      soloBasico={soloBasico}
    />
  );
}
