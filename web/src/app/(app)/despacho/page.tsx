import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { agruparAvance, estaAtrasada, porcentajeAvance, puedeGestionarDespacho } from "@/lib/despacho";
import { DespachoNavegacion } from "@/components/despacho/DespachoNavegacion";
import { Badge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

function mesActual() {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(new Date());
  const [anio, mes] = partes.split("-").map(Number);
  const inicio = new Date(Date.UTC(anio, mes - 1, 1));
  const fin = new Date(Date.UTC(anio, mes, 1));
  return { inicio, fin, etiqueta: new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(inicio) };
}

export default async function DespachoPage() {
  if (!(await moduloActivo("despacho"))) redirect("/");
  const sesion = await getSesion();
  const esGestion = puedeGestionarDespacho(sesion?.user?.puesto, sesion?.user?.rol);
  const { inicio, fin, etiqueta } = mesActual();
  const [actividades, clientes, usuarios] = await Promise.all([
    db.despachoActividad.findMany({
      where: { periodo: { gte: inicio, lt: fin }, ...(esGestion ? {} : { responsableId: sesion?.user?.id ? BigInt(sesion.user.id) : -1n }) },
      include: { cliente: { include: { contacto: { select: { nombre: true, empresa: true } } } } },
      orderBy: [{ fechaLimite: "asc" }],
    }),
    db.despachoCliente.count({ where: { activo: true } }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
  ]);
  const porcentaje = porcentajeAvance(actividades);
  const atrasadas = actividades.filter((actividad) => estaAtrasada(actividad));
  const porCliente = agruparAvance(actividades, (actividad) => actividad.cliente.contacto.empresa ?? actividad.cliente.contacto.nombre).slice(0, 8);
  const nombres = new Map(usuarios.map((usuario) => [String(usuario.id), usuario.nombre]));
  const porResponsable = agruparAvance(actividades, (actividad) => actividad.responsableId ? nombres.get(String(actividad.responsableId)) ?? "Sin nombre" : "Sin asignar");
  const tonoAvance = (valor: number | null) => valor === null ? "bg-muted-foreground/30" : valor >= 80 ? "bg-success" : valor >= 40 ? "bg-warning" : "bg-destructive";

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <DespachoNavegacion actual="resumen" titulo="Resumen del despacho" descripcion={`Avance de ${etiqueta}.`} esGestion={esGestion} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <div className="surface p-4 sm:p-5"><p className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Clientes activos</p><p className="mt-2 text-3xl font-bold tracking-tight text-foreground tnum">{clientes}</p></div>
        <div className="surface p-4 sm:p-5"><p className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Actividades del mes</p><p className="mt-2 text-3xl font-bold tracking-tight text-foreground tnum">{actividades.length}</p></div>
        <div className="surface p-4 sm:p-5"><p className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Avance</p><p className="mt-2 text-3xl font-bold tracking-tight text-foreground tnum">{porcentaje === null ? "Sin datos" : `${porcentaje}%`}</p></div>
        <div className="surface p-4 sm:p-5"><p className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Atrasadas</p><p className="mt-2 text-3xl font-bold tracking-tight text-destructive tnum">{atrasadas.length}</p></div>
      </div>

      {actividades.length === 0 ? (
        <EmptyState titulo="Sin actividades este mes" descripcion="Configura procesos y genera el mes para empezar a medir el avance." accion="Ir a configuración" href="/despacho/configuracion" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="surface space-y-4 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-foreground">Avance por cliente</h2>
            {porCliente.map((grupo) => (
              <div key={grupo.clave} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${tonoAvance(grupo.porcentaje)}`} aria-hidden="true" />
                    <span className="truncate font-medium text-foreground">{grupo.clave}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{grupo.completadas}/{grupo.total} · {grupo.porcentaje}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className={`h-full rounded-full ${tonoAvance(grupo.porcentaje)}`} style={{ width: `${grupo.porcentaje ?? 0}%` }} /></div>
              </div>
            ))}
          </section>
          <section className="surface space-y-4 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-foreground">Carga por responsable</h2>
            {porResponsable.map((grupo) => (
              <div key={grupo.clave} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium text-foreground">{grupo.clave}</span><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{grupo.completadas}/{grupo.total} · {grupo.porcentaje}%</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-info" style={{ width: `${grupo.porcentaje ?? 0}%` }} /></div>
              </div>
            ))}
          </section>
        </div>
      )}

      {atrasadas.length > 0 && (
        <section className="surface space-y-3 p-4 sm:p-5">
          <h2 className="text-base font-semibold text-foreground">Atrasadas</h2>
          <div className="divide-y divide-border/60">
            {serializar(atrasadas.slice(0, 10)).map((actividad: { id: string; titulo: string; estado: string; fechaLimite: string; cliente: { contacto: { nombre: string; empresa: string | null } } }) => (
              <div key={actividad.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0 truncate text-foreground">{actividad.cliente.contacto.empresa ?? actividad.cliente.contacto.nombre} · {actividad.titulo}</span>
                <span className="flex items-center gap-2 text-muted-foreground">{actividad.fechaLimite.slice(0, 10)}<Badge tono={actividad.estado === "completada" ? "success" : "warning"}>{actividad.estado.replaceAll("_", " ")}</Badge></span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
