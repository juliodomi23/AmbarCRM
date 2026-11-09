import { notFound, redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { puedeGestionarDespacho } from "@/lib/despacho";
import { aBigInt } from "@/lib/ids";
import { DespachoNavegacion } from "@/components/despacho/DespachoNavegacion";
import { DespachoClienteDetalle } from "@/components/despacho/DespachoClienteDetalle";

export const dynamic = "force-dynamic";

export default async function DespachoClientePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await moduloActivo("despacho"))) redirect("/");
  const id = aBigInt((await params).id);
  if (!id) notFound();
  const sesion = await getSesion();
  const esGestion = puedeGestionarDespacho(sesion?.user?.puesto, sesion?.user?.rol);
  const [cliente, procesos, usuarios] = await Promise.all([
    db.despachoCliente.findUnique({
      where: { id },
      include: {
        contacto: { select: { id: true, nombre: true, telefono: true, email: true, empresa: true } },
        procesos: { include: { proceso: { select: { id: true, nombre: true, periodicidad: true } } } },
        actividades: { orderBy: [{ periodo: "desc" }, { fechaLimite: "asc" }], take: 100 },
      },
    }),
    db.despachoProceso.findMany({
      where: { activo: true },
      include: { actividades: { where: { activo: true }, orderBy: [{ orden: "asc" }, { id: "asc" }], select: { id: true, nombre: true } } },
      orderBy: { nombre: "asc" },
    }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);
  if (!cliente) notFound();
  return (
    <div className="space-y-5">
      <DespachoNavegacion actual="clientes" titulo="Ficha del cliente" descripcion="Datos fiscales, procesos asignados y actividades recientes." esGestion={esGestion} />
      <DespachoClienteDetalle inicial={serializar(cliente)} procesos={serializar(procesos)} usuarios={serializar(usuarios)} esGestion={esGestion} />
    </div>
  );
}
