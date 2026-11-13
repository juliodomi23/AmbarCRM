import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { puedeConfirmarActividadDespacho, puedeGestionarDespacho, puedeVerTodasActividadesDespacho } from "@/lib/despacho";
import { DespachoNavegacion } from "@/components/despacho/DespachoNavegacion";
import { DespachoClientes } from "@/components/despacho/DespachoClientes";

export const dynamic = "force-dynamic";

export default async function DespachoClientesPage() {
  if (!(await moduloActivo("despacho"))) redirect("/");
  const sesion = await getSesion();
  const esGestion = puedeGestionarDespacho(sesion?.user?.puesto, sesion?.user?.rol);
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "despacho", activo: true }, select: { config: true } });
  const puedeVerTodo = puedeVerTodasActividadesDespacho({ id: sesion?.user?.id, puesto: sesion?.user?.puesto, rol: sesion?.user?.rol }, modulo?.config);
  const puedeConfirmar = puedeConfirmarActividadDespacho({ id: sesion?.user?.id, puesto: sesion?.user?.puesto, rol: sesion?.user?.rol }, modulo?.config);
  const responsableId = sesion?.user?.id ? BigInt(sesion.user.id) : -1n;
  const partesMes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(new Date());
  const [anio, mes] = partesMes.split("-").map(Number);
  const inicioMes = new Date(Date.UTC(anio, mes - 1, 1));
  const finMes = new Date(Date.UTC(anio, mes, 1));
  const [clientes, contactos, usuarios] = await Promise.all([
    db.despachoCliente.findMany({
      where: puedeVerTodo ? {} : { actividades: { some: { responsableId } } },
      include: {
        contacto: { select: { id: true, nombre: true, telefono: true, empresa: true } },
        procesos: { include: { proceso: { select: { id: true, nombre: true, periodicidad: true } } } },
        _count: { select: { actividades: true } },
        actividades: { where: { periodo: { gte: inicioMes, lt: finMes }, ...(puedeVerTodo ? {} : { responsableId }) }, select: { estado: true, fechaLimite: true, requiereConfirmacion: true, confirmadaAt: true } },
      },
      orderBy: { updatedAt: "desc" }, take: 300,
    }),
    db.contacto.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" }, take: 500 }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4 p-4 md:p-6 lg:p-8">
      <DespachoNavegacion actual="clientes" titulo="Clientes del despacho" descripcion="Ficha de cada cliente, sus procesos y responsable." esGestion={esGestion} puedeVerTodo={puedeVerTodo} puedeConfirmar={puedeConfirmar} />
      <DespachoClientes iniciales={serializar(clientes)} contactos={serializar(contactos)} usuarios={serializar(usuarios)} esGestion={esGestion} />
    </div>
  );
}
