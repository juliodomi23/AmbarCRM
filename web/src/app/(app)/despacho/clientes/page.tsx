import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { puedeGestionarDespacho } from "@/lib/despacho";
import { DespachoNavegacion } from "@/components/despacho/DespachoNavegacion";
import { DespachoClientes } from "@/components/despacho/DespachoClientes";

export const dynamic = "force-dynamic";

export default async function DespachoClientesPage() {
  if (!(await moduloActivo("despacho"))) redirect("/");
  const sesion = await getSesion();
  const esGestion = puedeGestionarDespacho(sesion?.user?.puesto, sesion?.user?.rol);
  const [clientes, contactos, usuarios] = await Promise.all([
    db.despachoCliente.findMany({
      include: {
        contacto: { select: { id: true, nombre: true, telefono: true, empresa: true } },
        procesos: { include: { proceso: { select: { id: true, nombre: true, periodicidad: true } } } },
        _count: { select: { actividades: true } },
      },
      orderBy: { updatedAt: "desc" }, take: 300,
    }),
    db.contacto.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" }, take: 500 }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);
  return (
    <div className="space-y-5">
      <DespachoNavegacion actual="clientes" titulo="Clientes del despacho" descripcion="Ficha de cada cliente, sus procesos y responsable." esGestion={esGestion} />
      <DespachoClientes iniciales={serializar(clientes)} contactos={serializar(contactos)} usuarios={serializar(usuarios)} esGestion={esGestion} />
    </div>
  );
}
