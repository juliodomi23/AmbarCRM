import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { puedeGestionarDespacho } from "@/lib/despacho";
import { DespachoNavegacion } from "@/components/despacho/DespachoNavegacion";
import { DespachoConfiguracion } from "@/components/despacho/DespachoConfiguracion";

export const dynamic = "force-dynamic";

export default async function DespachoConfiguracionPage() {
  if (!(await moduloActivo("despacho"))) redirect("/");
  const sesion = await getSesion();
  const esGestion = puedeGestionarDespacho(sesion?.user?.puesto, sesion?.user?.rol);
  const procesos = await db.despachoProceso.findMany({
    include: { actividades: { orderBy: [{ orden: "asc" }, { id: "asc" }] }, _count: { select: { clientes: true } } },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <DespachoNavegacion actual="configuracion" titulo="Configuración del despacho" descripcion="Catálogo de procesos, actividades y generación mensual." esGestion={esGestion} />
      <DespachoConfiguracion iniciales={serializar(procesos)} esGestion={esGestion} />
    </div>
  );
}
