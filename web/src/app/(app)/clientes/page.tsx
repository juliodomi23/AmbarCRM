import { redirect } from "next/navigation";
import { ClientesCliente } from "@/components/clientes/ClientesCliente";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  if (!(await moduloActivo("clientes"))) redirect("/");
  const [clientes, contactosDisponibles, citasActivo] = await Promise.all([
    db.contacto.findMany({
      where: { expediente: { isNot: null } },
      include: {
        expediente: true,
        citas: {
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
      clientes={serializar(clientes)}
      contactosDisponibles={serializar(contactosDisponibles)}
      citasActivo={citasActivo}
    />
  );
}
