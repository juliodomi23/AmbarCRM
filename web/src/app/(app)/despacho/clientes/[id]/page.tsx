import { notFound, redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { puedeConfirmarActividadDespacho, puedeGestionarDespacho, puedeVerTodasActividadesDespacho } from "@/lib/despacho";
import { aBigInt } from "@/lib/ids";
import { DespachoNavegacion } from "@/components/despacho/DespachoNavegacion";
import { DespachoClienteDetalle } from "@/components/despacho/DespachoClienteDetalle";
import { DespachoActividades } from "@/components/despacho/DespachoActividades";

export const dynamic = "force-dynamic";

function mesValido(valor?: string) { return valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : null; }

export default async function DespachoClientePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string }> }) {
  if (!(await moduloActivo("despacho"))) redirect("/");
  const id = aBigInt((await params).id);
  if (!id) notFound();
  const sesion = await getSesion();
  const esGestion = puedeGestionarDespacho(sesion?.user?.puesto, sesion?.user?.rol);
  const query = await searchParams;
  const mesHoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(new Date());
  const mes = mesValido(query.mes) ?? mesHoy;
  const [anio, numeroMes] = mes.split("-").map(Number);
  const inicio = new Date(Date.UTC(anio, numeroMes - 1, 1));
  const fin = new Date(Date.UTC(anio, numeroMes, 1));
  const [moduloDespacho, procesos, usuarios] = await Promise.all([
    db.moduloOrg.findFirst({ where: { clave: "despacho", activo: true }, select: { config: true } }),
    db.despachoProceso.findMany({
      where: { activo: true },
      include: { actividades: { where: { activo: true }, orderBy: [{ orden: "asc" }, { id: "asc" }], select: { id: true, nombre: true } } },
      orderBy: { nombre: "asc" },
    }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);
  const puedeVerTodo = puedeVerTodasActividadesDespacho(
    { id: sesion?.user?.id, puesto: sesion?.user?.puesto, rol: sesion?.user?.rol },
    moduloDespacho?.config,
  );
  const responsableId = sesion?.user?.id ? BigInt(sesion.user.id) : -1n;
  const filtroActividad = puedeVerTodo ? {} : { responsableId };
  const [cliente, actividades] = await Promise.all([
    db.despachoCliente.findFirst({
      where: { id, ...(puedeVerTodo ? {} : { actividades: { some: filtroActividad } }) },
      include: {
        contacto: { select: { id: true, nombre: true, telefono: true, email: true, empresa: true } },
        procesos: { include: { proceso: { select: { id: true, nombre: true, periodicidad: true } } } },
        actividades: { where: filtroActividad, orderBy: [{ periodo: "desc" }, { fechaLimite: "asc" }], take: 100 },
      },
    }),
    db.despachoActividad.findMany({
      where: { clienteId: id, periodo: { gte: inicio, lt: fin }, ...filtroActividad },
      include: { cliente: { include: { contacto: { select: { nombre: true, empresa: true } } } } },
      orderBy: [{ fechaLimite: "asc" }, { id: "asc" }], take: 500,
    }),
  ]);
  if (!cliente) notFound();
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <DespachoNavegacion actual="clientes" titulo="Ficha del cliente" descripcion="Datos fiscales, procesos asignados y actividades recientes." esGestion={esGestion} puedeVerTodo={puedeVerTodo} />
      <DespachoClienteDetalle inicial={serializar(cliente)} procesos={serializar(procesos)} usuarios={serializar(usuarios)} esGestion={esGestion} />
      <section className="space-y-3">
        <div><h2 className="text-lg font-semibold text-foreground">Actividades del cliente · Kanban</h2><p className="text-sm text-muted-foreground">Las completadas pendientes de confirmación no suman al avance.</p></div>
        <DespachoActividades
          iniciales={serializar(actividades)}
          clientes={serializar([{ id: cliente.id, contacto: cliente.contacto }])}
          usuarios={serializar(usuarios)}
          esGestion={esGestion}
          puedeConfirmar={puedeConfirmarActividadDespacho({ id: sesion?.user?.id, puesto: sesion?.user?.puesto, rol: sesion?.user?.rol }, moduloDespacho?.config)}
          modo="tablero"
          clienteIdInicial={String(cliente.id)}
          soloCliente
          periodoInicial={mes}
        />
      </section>
    </div>
  );
}
