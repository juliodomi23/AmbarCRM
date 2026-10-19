import { redirect } from "next/navigation";
import { ClientesCliente } from "@/components/clientes/ClientesCliente";
import { accesoAgendaActual } from "@/lib/citas-acceso";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function PacientesPage() {
  if (!(await moduloActivo("pacientes"))) redirect("/");
  const acceso = await accesoAgendaActual();
  const [pacientes, contactosDisponibles, citasActivo] = await Promise.all([
    db.contacto.findMany({
      where: { expediente: { isNot: null } },
      include: {
        expediente: true,
        citas: {
          where: acceso.where,
          include: { doctor: true },
          orderBy: { inicio: "desc" },
          take: 10,
        },
      },
      orderBy: { nombre: "asc" },
    }),
    db.contacto.findMany({
      where: { expediente: { is: null } },
      select: { id: true, nombre: true, telefono: true, email: true },
      orderBy: { nombre: "asc" },
      take: 500,
    }),
    moduloActivo("citas"),
  ]);
  return (
    <ClientesCliente
      clientes={serializar(pacientes)}
      contactosDisponibles={serializar(contactosDisponibles)}
      citasActivo={citasActivo}
      modo="pacientes"
    />
  );
}

