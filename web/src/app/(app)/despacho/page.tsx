import Link from "next/link";
import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { agruparAvance, actividadCuentaComoCompletada, estaAtrasada, porcentajeAvance, puedeConfirmarActividadDespacho, puedeGestionarDespacho, puedeVerTodasActividadesDespacho, etiquetaAvance, tonoAvance } from "@/lib/despacho";
import { DespachoNavegacion } from "@/components/despacho/DespachoNavegacion";
import { Badge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

function mesValido(valor: string | undefined) { return valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : null; }

function rangoMes(mesTexto: string) {
  const [anio, mes] = mesTexto.split("-").map(Number);
  const inicio = new Date(Date.UTC(anio, mes - 1, 1));
  const fin = new Date(Date.UTC(anio, mes, 1));
  const anterior = mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, "0")}`;
  const siguiente = mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, "0")}`;
  return { inicio, fin, anterior, siguiente, etiqueta: new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(inicio) };
}

function fechaCorta(fecha: string | Date) { const clave = typeof fecha === "string" ? fecha.slice(0, 10) : fecha.toISOString().slice(0, 10); return new Date(`${clave}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", ""); }
function iniciales(nombre: string) { return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase(); }
function diasAtraso(fecha: string | Date) { const clave = typeof fecha === "string" ? fecha.slice(0, 10) : fecha.toISOString().slice(0, 10); const limite = new Date(`${clave}T23:59:59-06:00`); return Math.max(1, Math.floor((Date.now() - limite.getTime()) / 86400000)); }

export default async function DespachoPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  if (!(await moduloActivo("despacho"))) redirect("/");
  const { mes: mesQuery } = await searchParams;
  const mesPorDefecto = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(new Date());
  const mes = mesValido(mesQuery) ?? mesPorDefecto;
  const sesion = await getSesion();
  const esGestion = puedeGestionarDespacho(sesion?.user?.puesto, sesion?.user?.rol);
  const { inicio, fin, etiqueta, anterior, siguiente } = rangoMes(mes);
  const [moduloDespacho, usuarios] = await Promise.all([
    db.moduloOrg.findFirst({ where: { clave: "despacho", activo: true }, select: { config: true } }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
  ]);
  const identidad = { id: sesion?.user?.id, puesto: sesion?.user?.puesto, rol: sesion?.user?.rol };
  const puedeVerTodo = puedeVerTodasActividadesDespacho(identidad, moduloDespacho?.config);
  const puedeConfirmar = puedeConfirmarActividadDespacho(identidad, moduloDespacho?.config);
  const responsableId = sesion?.user?.id ? BigInt(sesion.user.id) : -1n;
  const [actividades, clientes] = await Promise.all([
    db.despachoActividad.findMany({
      where: { periodo: { gte: inicio, lt: fin }, ...(puedeVerTodo ? {} : { responsableId }) },
      include: { cliente: { include: { contacto: { select: { nombre: true, empresa: true } } } } },
      orderBy: [{ fechaLimite: "asc" }],
    }),
    db.despachoCliente.count({ where: { activo: true, ...(puedeVerTodo ? {} : { actividades: { some: { periodo: { gte: inicio, lt: fin }, responsableId } } }) } }),
  ]);
  const porcentaje = porcentajeAvance(actividades);
  const atrasadas = actividades.filter((actividad) => estaAtrasada(actividad));
  const limiteTresDias = new Date(); limiteTresDias.setDate(limiteTresDias.getDate() + 3);
  const proximasAVencer = actividades.filter((actividad) => {
    if (actividad.estado === "completada" || estaAtrasada(actividad)) return false;
    const fecha = new Date(`${new Date(actividad.fechaLimite).toISOString().slice(0, 10)}T23:59:59-06:00`);
    return fecha <= limiteTresDias;
  }).sort((a, b) => new Date(a.fechaLimite).getTime() - new Date(b.fechaLimite).getTime());
  const porVencer = proximasAVencer.length;
  const porCliente = agruparAvance(actividades, (actividad) => String(actividad.cliente.id));
  const nombres = new Map(usuarios.map((usuario) => [String(usuario.id), usuario.nombre]));
  const colorAvance = (valor: number | null, vencidas: number) => ({ success: "bg-success", warning: "bg-warning", destructive: "bg-destructive", neutral: "bg-muted-foreground/30" })[tonoAvance(valor, vencidas)];

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <DespachoNavegacion actual="resumen" titulo="Resumen del despacho" descripcion={`Avance de ${etiqueta}.`} esGestion={esGestion} puedeVerTodo={puedeVerTodo} puedeConfirmar={puedeConfirmar} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold capitalize text-foreground">Resumen · {etiqueta}</h2>
        <nav aria-label="Cambiar mes" className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card p-1">
          <Link href={`/despacho?mes=${anterior}`} aria-label="Mes anterior" className="grid h-9 w-9 place-items-center rounded-lg text-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">‹</Link>
          <span className="min-w-32 text-center text-sm font-medium capitalize text-foreground">{etiqueta}</span>
          <Link href={`/despacho?mes=${siguiente}`} aria-label="Mes siguiente" className="grid h-9 w-9 place-items-center rounded-lg text-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">›</Link>
        </nav>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,340px)_1fr]">
        <Link href={`/despacho/rendimiento?mes=${mes}`} className="surface group flex min-h-48 items-center gap-5 p-4 transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-6" aria-label={`Avance global ${porcentaje ?? 0} por ciento. Ver desglose por contador y cliente`}>
          <div className="relative grid h-32 w-32 shrink-0 place-items-center sm:h-36 sm:w-36">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label={`Avance global ${porcentaje ?? 0} por ciento`}>
              <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
              <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--primary))" strokeWidth="10" strokeLinecap="round" strokeDasharray={2 * Math.PI * 52} strokeDashoffset={2 * Math.PI * 52 * (1 - (porcentaje ?? 0) / 100)} />
            </svg>
            <div className="absolute text-center"><p className="text-3xl font-bold text-foreground tnum">{porcentaje ?? 0}%</p><p className="text-xs text-muted-foreground">avance</p></div>
          </div>
          <div><p className="text-sm font-medium text-muted-foreground">Actividades confirmadas</p><p className="mt-1 text-xl font-semibold text-foreground tnum">{actividades.filter(actividadCuentaComoCompletada).length} <span className="text-sm font-normal text-muted-foreground">de {actividades.length}</span></p><p className="mt-2 text-xs font-semibold text-primary group-hover:underline">Ver contadores y clientes →</p></div>
        </Link>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="surface p-4 sm:p-5"><p className="text-sm text-muted-foreground">Clientes activos</p><p className="mt-3 text-3xl font-bold text-foreground tnum">{clientes}</p></div>
          <div className="surface p-4 sm:p-5"><p className="text-sm text-muted-foreground">Atrasadas</p><p className="mt-3 text-3xl font-bold text-destructive tnum">{atrasadas.length}</p></div>
          <div className="surface p-4 sm:p-5"><p className="text-sm text-muted-foreground">Vencen en 3 días</p><p className="mt-3 text-3xl font-bold text-foreground tnum">{porVencer}</p></div>
        </div>
      </div>

      {actividades.length === 0 ? (
        <EmptyState titulo="Sin actividades este mes" descripcion="Configura procesos y genera el mes para empezar a medir el avance." accion="Ir a configuración" href="/despacho/configuracion" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="surface space-y-4 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-foreground">Avance por cliente</h2>
            {porCliente.map((grupo) => {
              const cliente = actividades.find((actividad) => String(actividad.cliente.id) === grupo.clave)?.cliente;
              const nombre = cliente?.contacto.empresa ?? cliente?.contacto.nombre ?? "Cliente";
              return <Link key={grupo.clave} href={`/despacho/clientes/${grupo.clave}?mes=${mes}`} className="block space-y-1.5 rounded-lg p-2 transition hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${colorAvance(grupo.porcentaje, grupo.atrasadas)}`} aria-hidden="true" />
                    <span className="truncate font-medium text-foreground">{nombre}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-foreground">{grupo.completadas}/{grupo.total} · {grupo.porcentaje}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className={`h-full rounded-full ${colorAvance(grupo.porcentaje, grupo.atrasadas)}`} style={{ width: `${grupo.porcentaje ?? 0}%` }} /></div>
                <p className="text-xs font-medium text-muted-foreground">{etiquetaAvance(grupo.porcentaje, grupo.atrasadas)}</p>
              </Link>;
            })}
          </section>
          <section className="surface space-y-4 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-foreground">Próximas a vencer</h2>
            {proximasAVencer.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada vence en los próximos 3 días.</p>
            ) : proximasAVencer.slice(0, 6).map((actividad) => {
              const nombre = actividad.responsableId ? nombres.get(String(actividad.responsableId)) ?? "Sin asignar" : "Sin asignar";
              return (
                <Link key={String(actividad.id)} href={`/despacho/clientes/${actividad.cliente.id}?mes=${mes}`} className="block space-y-1 rounded-lg p-2 transition hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-foreground">{actividad.cliente.contacto.empresa ?? actividad.cliente.contacto.nombre}</span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-warning">{fechaCorta(actividad.fechaLimite)}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{actividad.titulo} · {nombre}</p>
                </Link>
              );
            })}
          </section>
        </div>
      )}

      {atrasadas.length > 0 && (
        <section className="surface space-y-3 p-4 sm:p-5">
          <h2 className="text-base font-semibold text-foreground">Atrasadas</h2>
          <div className="divide-y divide-border/60">
            {serializar(atrasadas.slice(0, 5)).map((actividad: { id: string; titulo: string; estado: string; fechaLimite: string; responsableId: string | null; cliente: { contacto: { nombre: string; empresa: string | null } } }) => {
              const nombre = actividad.responsableId ? nombres.get(actividad.responsableId) ?? "Sin asignar" : "Sin asignar";
              const dias = diasAtraso(actividad.fechaLimite);
              return <div key={actividad.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_150px_110px_130px]">
                <span className="min-w-0"><span className="block truncate font-medium text-foreground">{actividad.cliente.contacto.empresa ?? actividad.cliente.contacto.nombre}</span><span className="block truncate text-muted-foreground">{actividad.titulo}</span></span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-label={`Responsable: ${nombre}`} title={nombre}>{iniciales(nombre)}</span><span className="hidden truncate sm:inline">{nombre}</span></span>
                <span className="text-xs text-destructive"><span className="block font-semibold">{fechaCorta(actividad.fechaLimite)}</span><span>hace {dias} días</span></span>
                <Badge tono="warning" className="min-h-8 justify-center border border-warning/30 bg-warning/10 px-3 text-xs font-semibold"><span aria-hidden="true">●</span>{actividad.estado.replaceAll("_", " ")}</Badge>
              </div>;
            })}
          </div>
          {atrasadas.length > 5 && <details className="group"><summary className="min-h-10 cursor-pointer list-none text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Ver todas ({atrasadas.length})</summary><div className="divide-y divide-border/60">{serializar(atrasadas.slice(5)).map((actividad: { id: string; titulo: string; estado: string; fechaLimite: string; responsableId: string | null; cliente: { contacto: { nombre: string; empresa: string | null } } }) => { const nombre = actividad.responsableId ? nombres.get(actividad.responsableId) ?? "Sin asignar" : "Sin asignar"; return <div key={actividad.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_150px_110px_130px]"><span className="min-w-0"><span className="block truncate font-medium text-foreground">{actividad.cliente.contacto.empresa ?? actividad.cliente.contacto.nombre}</span><span className="block truncate text-muted-foreground">{actividad.titulo}</span></span><span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-label={`Responsable: ${nombre}`} title={nombre}>{iniciales(nombre)}</span><span className="hidden truncate sm:inline">{nombre}</span></span><span className="text-xs text-destructive"><span className="block font-semibold">{fechaCorta(actividad.fechaLimite)}</span><span>hace {diasAtraso(actividad.fechaLimite)} días</span></span><Badge tono="warning" className="min-h-8 justify-center border border-warning/30 bg-warning/10 px-3 text-xs font-semibold"><span aria-hidden="true">●</span>{actividad.estado.replaceAll("_", " ")}</Badge></div>; })}</div></details>}
        </section>
      )}
    </div>
  );
}
