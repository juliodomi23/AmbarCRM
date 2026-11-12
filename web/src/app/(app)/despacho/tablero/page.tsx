import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { puedeConfirmarActividadDespacho, puedeGestionarDespacho, puedeVerTodasActividadesDespacho } from "@/lib/despacho";
import { DespachoNavegacion } from "@/components/despacho/DespachoNavegacion";
import { DespachoActividades } from "@/components/despacho/DespachoActividades";

export const dynamic = "force-dynamic";

function mesValido(valor?: string) { return valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : null; }

export default async function DespachoTableroPage({ searchParams }: { searchParams: Promise<{ periodo?: string; responsableId?: string }> }) {
  if (!(await moduloActivo("despacho"))) redirect("/");
  const sesion = await getSesion();
  const esGestion = puedeGestionarDespacho(sesion?.user?.puesto, sesion?.user?.rol);
  const params = await searchParams;
  const periodo = mesValido(params.periodo) ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(new Date());
  const [anio, numeroMes] = periodo.split("-").map(Number);
  const inicio = new Date(Date.UTC(anio, numeroMes - 1, 1));
  const fin = new Date(Date.UTC(anio, numeroMes, 1));
  const [moduloDespacho, usuarios] = await Promise.all([
    db.moduloOrg.findFirst({ where: { clave: "despacho", activo: true }, select: { config: true } }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);
  const puedeVerTodo = puedeVerTodasActividadesDespacho(
    { id: sesion?.user?.id, puesto: sesion?.user?.puesto, rol: sesion?.user?.rol },
    moduloDespacho?.config,
  );
  const puedeConfirmar = puedeConfirmarActividadDespacho(
    { id: sesion?.user?.id, puesto: sesion?.user?.puesto, rol: sesion?.user?.rol },
    moduloDespacho?.config,
  );
  const responsablePropio = sesion?.user?.id ? BigInt(sesion.user.id) : -1n;
  const responsableSolicitado = puedeVerTodo && params.responsableId && /^\d{1,20}$/.test(params.responsableId) ? BigInt(params.responsableId) : null;
  const filtroResponsable = responsableSolicitado ? { responsableId: responsableSolicitado } : puedeVerTodo ? {} : { responsableId: responsablePropio };
  const clientes = await db.despachoCliente.findMany({
    where: { activo: true, ...(puedeVerTodo ? {} : { actividades: { some: { responsableId: responsablePropio } } }) },
    select: { id: true, contacto: { select: { nombre: true, empresa: true } } }, orderBy: { updatedAt: "desc" }, take: 300,
  });
  const actividades = await db.despachoActividad.findMany({
    where: { periodo: { gte: inicio, lt: fin }, ...filtroResponsable },
    include: { cliente: { include: { contacto: { select: { nombre: true, empresa: true } } } } },
    orderBy: [{ fechaLimite: "asc" }, { id: "asc" }], take: 500,
  });
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <DespachoNavegacion actual="tablero" titulo="Tablero de actividades" descripcion="Todo lo que el despacho tiene que entregar, por estado y fecha límite." esGestion={esGestion} puedeVerTodo={puedeVerTodo} />
      <DespachoActividades iniciales={serializar(actividades)} clientes={serializar(clientes)} usuarios={serializar(usuarios)} esGestion={esGestion} puedeConfirmar={puedeConfirmar} modo="tablero" periodoInicial={periodo} responsableIdInicial={responsableSolicitado ? String(responsableSolicitado) : ""} />
    </div>
  );
}
