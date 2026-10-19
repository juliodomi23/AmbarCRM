import { configReservasEmpresa } from "@/lib/reservas/servidor";
import { redirect } from "next/navigation";
import { ClientesCliente } from "@/components/clientes/ClientesCliente";
import { accesoAgendaActual } from "@/lib/citas-acceso";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  if (!(await moduloActivo("clientes"))) redirect("/");
  const acceso = await accesoAgendaActual();
  const [clientes, contactosDisponibles, citasActivo] = await Promise.all([
    db.contacto.findMany({
      where: { expediente: { isNot: null } },
      include: {
        expediente: true,
        citas: {
          where: { ...acceso.where, inicio: { gte: new Date() }, estado: { in: ["programada", "confirmada", "en_sala"] } },
          include: { doctor: true },
          orderBy: { inicio: "asc" },
          take: 1,
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
      zona={(await configReservasEmpresa()).zona}
      clientes={serializar(clientes)}
      contactosDisponibles={serializar(contactosDisponibles)}
      citasActivo={citasActivo}
    />
  );
}
