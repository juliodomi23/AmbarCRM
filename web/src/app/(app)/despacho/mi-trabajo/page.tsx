import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { DespachoNavegacion } from "@/components/despacho/DespachoNavegacion";
import { DespachoActividades } from "@/components/despacho/DespachoActividades";

export const dynamic = "force-dynamic";

export default async function DespachoMiTrabajoPage() {
  if (!(await moduloActivo("despacho"))) redirect("/");
  const sesion = await getSesion();
  const userId = sesion?.user?.id ? BigInt(sesion.user.id) : 0n;
  const [actividades, clientes, usuarios] = await Promise.all([
    db.despachoActividad.findMany({
      where: { responsableId: userId },
      include: { cliente: { include: { contacto: { select: { nombre: true, empresa: true } } } } },
      orderBy: [{ fechaLimite: "asc" }, { id: "asc" }], take: 300,
    }),
    db.despachoCliente.findMany({ where: { activo: true }, select: { id: true, contacto: { select: { nombre: true, empresa: true } } }, orderBy: { updatedAt: "desc" }, take: 300 }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);
  return (
    <div className="space-y-5">
      <DespachoNavegacion actual="mi-trabajo" titulo="Mi trabajo" descripcion="Tus actividades asignadas, con lo atrasado primero." esGestion={false} />
      <DespachoActividades iniciales={serializar(actividades)} clientes={serializar(clientes)} usuarios={serializar(usuarios)} esGestion={false} modo="mias" />
    </div>
  );
}
