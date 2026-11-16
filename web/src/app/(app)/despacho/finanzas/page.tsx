import { redirect } from "next/navigation";
import { DespachoFinanzas } from "@/components/despacho/DespachoFinanzas";
import { DespachoNavegacion } from "@/components/despacho/DespachoNavegacion";
import { db } from "@/lib/db";
import { puedeVerFinanzasDespacho } from "@/lib/despacho";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DespachoFinanzasPage() {
  if (!(await moduloActivo("despacho"))) redirect("/");
  const sesion = await getSesion();
  const [usuarios, clientes, modulo] = await Promise.all([
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true, email: true }, orderBy: { nombre: "asc" } }),
    db.despachoCliente.findMany({ where: { activo: true }, select: { id: true, contacto: { select: { nombre: true, empresa: true } } }, orderBy: { updatedAt: "desc" }, take: 1000 }),
    db.moduloOrg.findFirst({ where: { clave: "despacho", activo: true }, select: { config: true } }),
  ]);
  const puedeVerFinanzas = puedeVerFinanzasDespacho({ id: sesion?.user?.id, puesto: sesion?.user?.puesto, rol: sesion?.user?.rol }, modulo?.config);
  if (!puedeVerFinanzas) redirect("/despacho");
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <DespachoNavegacion actual="finanzas" titulo="Finanzas de Despacho y REFMEX" descripcion="Ingresos, cuentas por cobrar, costos y gastos por mes y responsable." esGestion={puedeVerFinanzas} />
      <DespachoFinanzas
        usuarios={serializar(usuarios)}
        clientes={serializar(clientes.map((cliente) => ({ id: String(cliente.id), nombre: cliente.contacto.empresa ?? cliente.contacto.nombre })))}
      />
    </div>
  );
}
