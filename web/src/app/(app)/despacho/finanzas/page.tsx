import { redirect } from "next/navigation";
import { DespachoFinanzas } from "@/components/despacho/DespachoFinanzas";
import { DespachoNavegacion } from "@/components/despacho/DespachoNavegacion";
import { db } from "@/lib/db";
import { puedeGestionarDespacho } from "@/lib/despacho";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DespachoFinanzasPage() {
  if (!(await moduloActivo("despacho"))) redirect("/");
  const sesion = await getSesion();
  const esGestion = puedeGestionarDespacho(sesion?.user?.puesto, sesion?.user?.rol);
  if (!esGestion) redirect("/despacho");
  const [usuarios, clientes] = await Promise.all([
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true, email: true }, orderBy: { nombre: "asc" } }),
    db.despachoCliente.findMany({ where: { activo: true }, select: { id: true, contacto: { select: { nombre: true, empresa: true } } }, orderBy: { updatedAt: "desc" }, take: 1000 }),
  ]);
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <DespachoNavegacion actual="finanzas" titulo="Finanzas de Despacho y REFMEX" descripcion="Ingresos, cuentas por cobrar, costos y gastos por mes y responsable." esGestion={esGestion} />
      <DespachoFinanzas
        usuarios={serializar(usuarios)}
        clientes={serializar(clientes.map((cliente) => ({ id: String(cliente.id), nombre: cliente.contacto.empresa ?? cliente.contacto.nombre })))}
      />
    </div>
  );
}
