import { configReservasEmpresa } from "@/lib/reservas/servidor";
import { notFound, redirect } from "next/navigation";
import { ExpedienteCliente } from "@/components/contactos/ExpedienteCliente";
import type { Diente, EstadoDiente, ZonaDiente } from "@/components/contactos/Odontograma";
import { accesoAgendaActual } from "@/lib/citas-acceso";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function PacientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await moduloActivo("pacientes"))) redirect("/");
  const acceso = await accesoAgendaActual();
  const id = aBigInt((await params).id);
  if (id === null) notFound();
  const [contacto, doctores, citas, citasActivo, datosFiscales, facturacionActivo] = await Promise.all([
    db.contacto.findFirst({
      where: { id, expediente: { isNot: null } },
      include: {
        expediente: {
          include: {
            evoluciones: {
              where: acceso.restringida ? { OR: [{ citaId: null }, { cita: { is: acceso.where } }] } : {},
              include: { doctor: true, cita: true, registradoPor: true },
              orderBy: { createdAt: "desc" },
            },
            odontogramaZonas: { orderBy: [{ diente: "asc" }, { zona: "asc" }] },
          },
        },
      },
    }),
    db.doctor.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    db.cita.findMany({
      where: { contactoId: id, ...acceso.where },
      include: { doctor: true },
      orderBy: { inicio: "desc" },
      take: 20,
    }),
    moduloActivo("citas"),
    db.datosFiscales.findFirst({ where: { contactoId: id } }),
    moduloActivo("facturacion"),
  ]);
  if (!contacto) notFound();
  const dientes = new Map<number, Diente>();
  for (const zona of contacto.expediente!.odontogramaZonas) {
    const diente = dientes.get(zona.diente) ?? { numero: zona.diente, zonas: {} };
    diente.zonas[zona.zona as ZonaDiente] = zona.estado as EstadoDiente;
    dientes.set(zona.diente, diente);
  }
  const odontograma = Array.from(dientes.values());
  return (
    <ExpedienteCliente
      zona={(await configReservasEmpresa()).zona}
      contacto={serializar(contacto)}
      doctores={serializar(doctores)}
      citas={serializar(citas)}
      citasActivo={citasActivo}
      modo="pacientes"
      odontograma={odontograma}
      datosFiscales={serializar(datosFiscales)}
      facturacionActivo={facturacionActivo}
    />
  );
}

