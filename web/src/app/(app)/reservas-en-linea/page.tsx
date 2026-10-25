import { EncabezadoPagina } from "@/components/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BotonEliminar } from "@/components/modulos/BotonEliminar";
import { FormularioModulo, type CampoFormulario } from "@/components/modulos/FormularioModulo";
import { EnlacePublico } from "@/components/reservas/EnlacePublico";
import { HorarioSemanal } from "@/components/reservas/HorarioSemanal";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { opcionesDe } from "@/lib/opciones-formularios";
import { fechaLocal, horaTexto } from "@/lib/reservas/horarios";
import { configReservas } from "@/lib/reservas/servidor";
import { getSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

function Seccion({ titulo, descripcion, accion, children }: {
  titulo: string; descripcion: string; accion?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 surface p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{titulo}</h2>
          <p className="text-xs text-muted-foreground">{descripcion}</p>
        </div>
        {accion}
      </header>
      {children}
    </section>
  );
}

export default async function ReservasEnLineaPage() {
  const sesion = await getSesion();
  if (!sesion?.user?.orgId) redirect("/login");
  if (!(await moduloActivo("reservas_en_linea"))) redirect("/");
  const esAdmin = sesion.user.rol === "admin";
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "reservas_en_linea" }, select: { config: true } });
  const cfg = configReservas(modulo?.config);
  const fechaHoy = fechaLocal(new Date(), cfg.zona);
  const hoy = new Date(`${fechaHoy}T00:00:00Z`);
  const [org, doctores, servicios, horarios, excepciones] = await Promise.all([
    db.org.findUnique({ where: { id: BigInt(sesion.user.orgId) }, select: { slug: true } }),
    db.doctor.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    db.servicioReserva.findMany({ include: { doctores: { include: { doctor: true } } }, orderBy: { nombre: "asc" } }),
    db.horarioDoctor.findMany({ include: { doctor: true }, orderBy: [{ diaSemana: "asc" }, { inicioMin: "asc" }] }),
    db.excepcionHorario.findMany({ where: { fecha: { gte: hoy } }, include: { doctor: true }, orderBy: { fecha: "asc" }, take: 100 }),
  ]);
  const enlace = `${(process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "")}/reservar/${org?.slug ?? ""}`;
  const opcionesDoctor = opcionesDe(doctores, (d) => d.nombre);
  const doctoresVista = doctores.map((doctor) => ({
    id: String(doctor.id),
    nombre: doctor.nombre,
    especialidad: doctor.especialidad,
    color: doctor.color,
  }));
  const horariosVista = horarios.map((horario) => ({
    id: String(horario.id),
    doctorId: String(horario.doctorId),
    diaSemana: horario.diaSemana,
    inicioMin: horario.inicioMin,
    finMin: horario.finMin,
  }));

  const camposServicio: CampoFormulario[] = [
    { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true },
    { nombre: "duracionMin", etiqueta: "Duración (minutos)", tipo: "numero", requerido: true, valorInicial: "30" },
    { nombre: "bufferMin", etiqueta: "Tiempo libre después (minutos)", tipo: "numero", valorInicial: "0", ayuda: "Limpieza o preparación entre citas" },
    { nombre: "precio", etiqueta: "Precio", tipo: "dinero" },
    { nombre: "doctorIds", etiqueta: "¿Quién lo da?", tipo: "multiseleccion", requerido: true, opciones: opcionesDoctor },
    { nombre: "descripcion", etiqueta: "Descripción", tipo: "textarea" },
  ];
  const camposEdicionServicio: CampoFormulario[] = [
    ...camposServicio,
    { nombre: "activo", etiqueta: "Visible para agendar", tipo: "seleccion", opciones: [{ valor: "true", etiqueta: "Sí" }, { valor: "false", etiqueta: "No" }] },
  ];

  return (
    <div className="space-y-5 p-4 md:p-6">
      <EncabezadoPagina titulo="Reservas en línea" descripcion="Tus clientes eligen servicio, especialista, día y hora; la cita aparece sola en tu agenda." />
      <EnlacePublico url={enlace} />
      {doctores.length === 0 && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          Primero da de alta a tus especialistas en <Link href="/citas" className="font-medium underline">Citas → Especialistas</Link> (el módulo Citas debe estar activo).
        </p>
      )}

      <Seccion titulo="Ajustes" descripcion="Reglas generales de la agenda pública."
        accion={esAdmin && (
          <FormularioModulo boton="Cambiar" titulo="Ajustes de reservas" endpoint="/api/reservas/ajustes" discreto
            valores={{ zona: cfg.zona, anticipacionMin: String(cfg.anticipacionMin), ventanaDias: String(cfg.ventanaDias), granularidadMin: String(cfg.granularidadMin), maxPorTelefono: String(cfg.maxPorTelefono) }}
            campos={[
              { nombre: "zona", etiqueta: "Zona horaria del negocio", tipo: "texto", requerido: true, ayuda: "Ejemplos: America/Mexico_City, America/Cancun o America/Tijuana. Cambiarla conserva el instante de las citas existentes." },
              { nombre: "anticipacionMin", etiqueta: "Anticipación mínima (minutos)", tipo: "numero", requerido: true },
              { nombre: "ventanaDias", etiqueta: "Días a futuro que se pueden agendar", tipo: "numero", requerido: true },
              { nombre: "granularidadMin", etiqueta: "Ofrecer horarios cada (minutos)", tipo: "numero", requerido: true },
              { nombre: "maxPorTelefono", etiqueta: "Máximo de citas por teléfono en 24 horas", tipo: "numero", requerido: true },
            ]} />
        )}>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { etiqueta: "Zona horaria", valor: cfg.zona },
            { etiqueta: "Anticipación", valor: `${cfg.anticipacionMin} min` },
            { etiqueta: "Ventana", valor: `${cfg.ventanaDias} días` },
            { etiqueta: "Intervalo", valor: `${cfg.granularidadMin} min` },
            { etiqueta: "Tope por teléfono", valor: `${cfg.maxPorTelefono} citas / 24 h` },
          ].map(({ etiqueta, valor }) => (
            <div key={etiqueta} className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{etiqueta}</p>
              <p className="mt-0.5 text-sm font-medium text-foreground">{valor}</p>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Servicios" descripcion="Lo que se puede agendar, cuánto dura y quién lo da."
        accion={esAdmin && doctores.length > 0 && (
          <FormularioModulo boton="+ Servicio" titulo="Nuevo servicio" endpoint="/api/reservas/servicios" campos={camposServicio} />
        )}>
        {servicios.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay servicios.</p>}
        {servicios.map((s) => (
          <div key={String(s.id)} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm">
            <div>
              <p className="font-medium">{s.nombre} {!s.activo && <span className="text-xs text-muted-foreground">(oculto)</span>}</p>
              <p className="text-xs text-muted-foreground">
                {s.duracionMin} min · {Number(s.precio).toLocaleString("es-MX", { style: "currency", currency: "MXN" })} · {s.doctores.map((d) => d.doctor.nombre).join(", ")}
              </p>
            </div>
            {esAdmin && (
              <FormularioModulo discreto boton="Editar" titulo="Editar servicio" endpoint={`/api/reservas/servicios/${s.id}`}
                campos={camposEdicionServicio} eliminar="Borrar servicio"
                valores={{
                  nombre: s.nombre, duracionMin: String(s.duracionMin), bufferMin: String(s.bufferMin), precio: String(s.precio),
                  doctorIds: s.doctores.map((d) => String(d.doctorId)).join(","), descripcion: s.descripcion ?? "", activo: String(s.activo),
                }} />
            )}
          </div>
        ))}
      </Seccion>

      <Seccion titulo="Horario semanal" descripcion="Cada especialista tiene su propio horario. Varios bloques en un día = turno partido.">
        <HorarioSemanal
          doctores={doctoresVista}
          horarios={horariosVista}
          esAdmin={esAdmin}
          opcionesDoctor={opcionesDoctor}
        />
      </Seccion>

      <Seccion titulo="Días especiales" descripcion="Vacaciones, días festivos o un horario distinto en una fecha."
        accion={esAdmin && doctores.length > 0 && (
          <FormularioModulo boton="+ Día especial" titulo="Día especial" endpoint="/api/reservas/excepciones" campos={[
            { nombre: "doctorId", etiqueta: "Especialista", tipo: "seleccion", requerido: true, opciones: opcionesDoctor },
            { nombre: "fecha", etiqueta: "Fecha", tipo: "fecha", requerido: true, valorInicial: fechaHoy },
            { nombre: "inicio", etiqueta: "Desde (vacío = cerrado todo el día)", tipo: "hora" },
            { nombre: "fin", etiqueta: "Hasta", tipo: "hora" },
            { nombre: "motivo", etiqueta: "Motivo", tipo: "texto" },
          ]} />
        )}>
        {excepciones.length === 0 && <p className="text-sm text-muted-foreground">Sin días especiales próximos.</p>}
        {excepciones.map((e) => (
          <div key={String(e.id)} className="flex items-center justify-between border-t pt-2 text-sm">
            <span>
              {e.fecha.toISOString().slice(0, 10)} · {e.doctor.nombre} ·{" "}
              {e.inicioMin === null || e.finMin === null ? "Cerrado" : `${horaTexto(e.inicioMin)}–${horaTexto(e.finMin)}`}
              {e.motivo ? ` · ${e.motivo}` : ""}
            </span>
            {esAdmin && <BotonEliminar endpoint={`/api/reservas/excepciones/${e.id}`} titulo="Quitar excepción" mensaje="Se quita esta excepción del calendario." />}
          </div>
        ))}
      </Seccion>
    </div>
  );
}
