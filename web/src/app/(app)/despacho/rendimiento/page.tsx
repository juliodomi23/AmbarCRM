import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { DespachoNavegacion } from "@/components/despacho/DespachoNavegacion";
import { db } from "@/lib/db";
import { agruparAvance, puedeGestionarDespacho, puedeVerTodasActividadesDespacho } from "@/lib/despacho";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

function mesValido(valor?: string) {
  return valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : null;
}

function desplazarMes(valor: string, delta: number) {
  const [anio, mes] = valor.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1 + delta, 1)).toISOString().slice(0, 7);
}

function inicioMes(valor: string) {
  const [anio, mes] = valor.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, 1));
}

function nombreMes(valor: string) {
  return new Intl.DateTimeFormat("es-MX", { month: "short", year: "2-digit", timeZone: "UTC" }).format(inicioMes(valor));
}

function barra(valor: number | null) {
  return `${Math.max(0, Math.min(100, valor ?? 0))}%`;
}

function nombreGrupo(clave: string, nombres: Map<string, string>) {
  return clave === "sin-asignar" ? "Sin asignar" : nombres.get(clave) ?? "Colaborador";
}

export default async function DespachoRendimientoPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  if (!(await moduloActivo("despacho"))) redirect("/");
  const sesion = await getSesion();
  if (!sesion?.user?.id) redirect("/login");
  const params = await searchParams;
  const hoyMexico = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(new Date());
  const mes = mesValido(params.mes) ?? hoyMexico;
  const meses = Array.from({ length: 6 }, (_, indice) => desplazarMes(mes, indice - 5));
  const desde = inicioMes(meses[0]);
  const hasta = inicioMes(desplazarMes(mes, 1));
  const [modulo, usuarios] = await Promise.all([
    db.moduloOrg.findFirst({ where: { clave: "despacho", activo: true }, select: { config: true } }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);
  const esGestion = puedeGestionarDespacho(sesion.user.puesto, sesion.user.rol);
  const puedeVerTodo = puedeVerTodasActividadesDespacho({ id: sesion.user.id, puesto: sesion.user.puesto, rol: sesion.user.rol }, modulo?.config);
  const actividades = await db.despachoActividad.findMany({
    where: {
      periodo: { gte: desde, lt: hasta },
      ...(puedeVerTodo ? {} : { responsableId: BigInt(sesion.user.id) }),
    },
    include: { cliente: { include: { contacto: { select: { nombre: true, empresa: true } } } } },
    orderBy: [{ periodo: "asc" }, { fechaLimite: "asc" }],
    take: 5000,
  });
  const nombres = new Map(usuarios.map((usuario) => [String(usuario.id), usuario.nombre]));
  const actividadMes = actividades.filter((actividad) => actividad.periodo.toISOString().slice(0, 7) === mes);
  const gruposResponsable = agruparAvance(actividades, (actividad) => actividad.responsableId ? String(actividad.responsableId) : "sin-asignar");
  const gruposPorId = new Map(gruposResponsable.map((grupo) => [grupo.clave, grupo]));
  const responsables = (puedeVerTodo ? usuarios.map((usuario) => String(usuario.id)) : [String(sesion.user.id)])
    .filter((id) => actividades.some((actividad) => String(actividad.responsableId ?? "sin-asignar") === id));
  if (puedeVerTodo && actividades.some((actividad) => !actividad.responsableId)) responsables.push("sin-asignar");
  const responsableVistas = responsables.map((responsableId) => {
    const tareas = actividades.filter((actividad) => String(actividad.responsableId ?? "sin-asignar") === responsableId);
    const porMes = meses.map((claveMes) => {
      const delMes = tareas.filter((actividad) => actividad.periodo.toISOString().slice(0, 7) === claveMes);
      const avance = agruparAvance(delMes, () => "total")[0];
      return { mes: claveMes, porcentaje: avance?.porcentaje ?? null, completadas: avance?.completadas ?? 0, total: avance?.total ?? 0 };
    });
    const clientes = [...new Map(tareas.filter((actividad) => actividad.periodo.toISOString().slice(0, 7) === mes).map((actividad) => [String(actividad.clienteId), {
      id: String(actividad.clienteId),
      nombre: actividad.cliente.contacto.empresa ?? actividad.cliente.contacto.nombre,
    }])).values()]
      .map((cliente) => {
        const delCliente = tareas.filter((actividad) => String(actividad.clienteId) === cliente.id && actividad.periodo.toISOString().slice(0, 7) === mes);
        const avance = agruparAvance(delCliente, () => "total")[0];
        return { ...cliente, porcentaje: avance?.porcentaje ?? null, completadas: avance?.completadas ?? 0, total: avance?.total ?? 0 };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es-MX"));
    const avanceSeleccionado = porMes.find((item) => item.mes === mes);
    return { id: responsableId, nombre: nombreGrupo(responsableId, nombres), porMes, clientes, avance: avanceSeleccionado };
  });
  const resumen = agruparAvance(actividadMes, () => "total")[0];
  const serializadas = serializar(resumen);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <DespachoNavegacion actual="rendimiento" titulo="Rendimiento del equipo" descripcion="Avance confirmado por responsable, cliente y mes." esGestion={esGestion} puedeVerTodo={puedeVerTodo} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">Periodo seleccionado</p><h2 className="text-xl font-semibold capitalize text-foreground">{nombreMes(mes)}</h2></div>
        <nav aria-label="Cambiar mes" className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card p-1">
          <Link href={`/despacho/rendimiento?mes=${desplazarMes(mes, -1)}`} aria-label="Mes anterior" className="grid h-9 w-9 place-items-center rounded-lg text-xl text-muted-foreground hover:bg-muted">‹</Link>
          <span className="min-w-32 text-center text-sm font-medium capitalize text-foreground">{nombreMes(mes)}</span>
          <Link href={`/despacho/rendimiento?mes=${desplazarMes(mes, 1)}`} aria-label="Mes siguiente" className="grid h-9 w-9 place-items-center rounded-lg text-xl text-muted-foreground hover:bg-muted">›</Link>
        </nav>
      </div>
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="surface p-4"><p className="text-sm text-muted-foreground">Avance del despacho</p><strong className="mt-2 block text-3xl text-foreground tnum">{serializadas?.porcentaje ?? "—"}{serializadas ? "%" : ""}</strong><p className="mt-1 text-xs text-muted-foreground">{serializadas?.completadas ?? 0} confirmadas de {serializadas?.total ?? 0}</p></article>
        <article className="surface p-4"><p className="text-sm text-muted-foreground">Responsables con actividad</p><strong className="mt-2 block text-3xl text-foreground tnum">{responsableVistas.length}</strong></article>
        <article className="surface p-4"><p className="text-sm text-muted-foreground">Pendientes de confirmar</p><strong className="mt-2 block text-3xl text-warning tnum">{actividadMes.filter((actividad) => actividad.estado === "completada" && actividad.requiereConfirmacion && !actividad.confirmadaAt).length}</strong></article>
      </section>

      {!responsableVistas.length ? (
        <EmptyState titulo="Sin actividades en este periodo" descripcion="Cuando existan actividades, aquí aparecerán los porcentajes de cada responsable y cliente." />
      ) : (
        <div className="space-y-4">
          {responsableVistas.map((responsable) => {
            const grupoActual = gruposPorId.get(responsable.id);
            return (
              <section key={responsable.id} className="surface space-y-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div><h3 className="text-lg font-semibold text-foreground">{responsable.nombre}</h3><p className="text-sm text-muted-foreground">{grupoActual?.completadas ?? 0} actividades confirmadas de {grupoActual?.total ?? 0} en los seis meses</p></div>
                  <span className="text-2xl font-bold text-primary tnum">{responsable.avance?.porcentaje ?? "—"}{responsable.avance ? "%" : ""}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {responsable.porMes.map((dato) => (
                    <Link key={dato.mes} href={`/despacho/tablero?periodo=${dato.mes}&responsableId=${responsable.id}`} className={`rounded-lg border p-2 text-center transition hover:border-primary/50 ${dato.mes === mes ? "border-primary/40 bg-primary/5" : "border-border/70 bg-muted/20"}`}>
                      <span className="block truncate text-[11px] capitalize text-muted-foreground">{nombreMes(dato.mes)}</span>
                      <span className="mt-1 block text-lg font-semibold text-foreground tnum">{dato.porcentaje ?? "—"}{dato.porcentaje === null ? "" : "%"}</span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded bg-muted"><span className="block h-full rounded bg-primary" style={{ width: barra(dato.porcentaje) }} /></span>
                      <span className="mt-1 block text-[10px] text-muted-foreground">{dato.completadas}/{dato.total}</span>
                    </Link>
                  ))}
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-foreground">Clientes de {nombreMes(mes)}</h4>
                  {responsable.clientes.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{responsable.clientes.map((cliente) => <Link key={cliente.id} href={`/despacho/clientes/${cliente.id}?mes=${mes}`} className="rounded-lg border border-border/70 p-3 transition hover:border-primary/50 hover:bg-primary/5"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium text-foreground">{cliente.nombre}</span><span className="shrink-0 text-sm font-semibold text-foreground tnum">{cliente.porcentaje ?? "—"}{cliente.porcentaje === null ? "" : "%"}</span></span><span className="mt-2 block h-2 overflow-hidden rounded bg-muted"><span className="block h-full rounded bg-primary" style={{ width: barra(cliente.porcentaje) }} /></span><span className="mt-1 block text-xs text-muted-foreground">{cliente.completadas} confirmadas de {cliente.total} · Abrir Kanban →</span></Link>)}</div> : <p className="text-sm text-muted-foreground">Sin clientes asignados en este mes.</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <aside className="surface border-dashed p-4 text-sm text-muted-foreground"><strong className="text-foreground">Calidad</strong> · la gráfica de calidad se agregará cuando llegue la escala de evaluación acordada.</aside>
    </div>
  );
}
