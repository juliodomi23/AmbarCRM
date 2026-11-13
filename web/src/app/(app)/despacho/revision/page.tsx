import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { puedeConfirmarActividadDespacho, puedeGestionarDespacho, puedeVerTodasActividadesDespacho } from "@/lib/despacho";
import { DespachoNavegacion } from "@/components/despacho/DespachoNavegacion";
import { DespachoRevision } from "@/components/despacho/DespachoRevision";

export const dynamic = "force-dynamic";

export default async function DespachoRevisionPage() {
  if (!(await moduloActivo("despacho"))) redirect("/");
  const sesion = await getSesion();
  const identidad = { id: sesion?.user?.id, puesto: sesion?.user?.puesto, rol: sesion?.user?.rol };
  const esGestion = puedeGestionarDespacho(sesion?.user?.puesto, sesion?.user?.rol);
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "despacho", activo: true }, select: { config: true } });
  const puedeConfirmar = puedeConfirmarActividadDespacho(identidad, modulo?.config);
  if (!puedeConfirmar) redirect("/despacho/mi-trabajo");
  const puedeVerTodo = puedeVerTodasActividadesDespacho(identidad, modulo?.config);

  const actividades = await db.despachoActividad.findMany({
    where: { estado: "completada", confirmadaAt: null },
    include: { cliente: { include: { contacto: { select: { nombre: true, empresa: true } } } } },
    orderBy: [{ fechaLimite: "asc" }, { id: "asc" }],
    take: 300,
  });
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <DespachoNavegacion actual="revision" titulo="Revisión" descripcion="Actividades completadas que esperan tu confirmación de calidad." esGestion={esGestion} puedeVerTodo={puedeVerTodo} puedeConfirmar={puedeConfirmar} />
      <DespachoRevision iniciales={serializar(actividades)} />
    </div>
  );
}
