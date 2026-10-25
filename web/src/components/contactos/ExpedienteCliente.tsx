"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DatosPersonalesFicha } from "@/components/clientes/DatosPersonalesFicha";
import { Badge, Boton, CLASE_CAMPO, type TonoBadge } from "@/components/ui";
import { IconoAlerta, IconoEditar, IconoInfo, IconoNota, IconoReloj } from "@/components/icons";
import { ZONA_CITAS } from "@/components/citas/fecha";
import type { DoctorCita } from "@/components/citas/tipos";
import { toast } from "@/components/Toaster";

type Expediente = {
  fechaNacimiento: string | null;
  sexo: string | null;
  alergias: string | null;
  antecedentes: string | null;
  medicamentos: string | null;
  observaciones: string | null;
  evoluciones: Evolucion[];
};

type Evolucion = {
  id: string;
  contenido: string;
  createdAt: string;
  doctor: DoctorCita | null;
  cita: { id: string; titulo: string } | null;
  registradoPor: { id: string; nombre: string } | null;
};

type CitaExpediente = {
  id: string;
  titulo: string;
  inicio: string;
  estado?: string;
  doctor: DoctorCita | null;
};

const TONO_CITA: Record<string, TonoBadge> = {
  programada: "info",
  confirmada: "success",
  en_sala: "primary",
  completada: "neutral",
  cancelada: "destructive",
  no_asistio: "warning",
};

const ETIQUETA_CITA: Record<string, string> = {
  programada: "Programada",
  confirmada: "Confirmada",
  en_sala: "En sala",
  completada: "Completada",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

const ESTADOS_ACTIVOS = ["programada", "confirmada", "en_sala"];

function valorFecha(fecha: string | null | undefined) {
  return fecha ? fecha.slice(0, 10) : "";
}

function errorApi(payload: unknown, respaldo: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    return String(payload.error);
  }
  return respaldo;
}

function iniciales(nombre: string) {
  return (
    nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function edad(fecha: string | null | undefined) {
  if (!fecha) return null;
  const [anio, mes, dia] = fecha.slice(0, 10).split("-").map(Number);
  if (!anio || !mes || !dia) return null;
  const hoy = new Date();
  let edadCalculada = hoy.getFullYear() - anio;
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) {
    edadCalculada -= 1;
  }
  return edadCalculada >= 0 && edadCalculada < 130 ? edadCalculada : null;
}

function fechaCorta(iso: string, zona: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    timeZone: zona,
  })
    .format(new Date(iso))
    .replace(".", "");
}

function horaCorta(iso: string, zona: string) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zona,
  }).format(new Date(iso));
}

function fechaHora(iso: string, zona: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zona,
  })
    .format(new Date(iso))
    .replace(".", "");
}

function etiquetaEstado(estado?: string) {
  return estado ? ETIQUETA_CITA[estado] ?? estado.replaceAll("_", " ") : "Sin estado";
}

function tonoEstado(estado?: string): TonoBadge {
  return estado ? TONO_CITA[estado] ?? "neutral" : "neutral";
}

function Tarjeta({
  id,
  titulo,
  descripcion,
  icono,
  accion,
  children,
}: {
  id?: string;
  titulo: string;
  descripcion?: string;
  icono?: React.ReactNode;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-start gap-2">
          {icono && <span className="mt-0.5 shrink-0 text-muted-foreground">{icono}</span>}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
            {descripcion && <p className="text-[11px] text-muted-foreground">{descripcion}</p>}
          </div>
        </div>
        {accion}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Dato({
  etiqueta,
  valor,
  detalle,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  detalle?: React.ReactNode;
}) {
  return (
    <div className="bg-card px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{etiqueta}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{valor}</p>
      {detalle && <p className="truncate text-[10px] text-muted-foreground">{detalle}</p>}
    </div>
  );
}

function FilaCita({ cita, zona, pasada }: { cita: CitaExpediente; zona: string; pasada?: boolean }) {
  const fecha = new Date(cita.inicio);
  const dia = new Intl.DateTimeFormat("es-MX", { day: "2-digit", timeZone: zona }).format(fecha);
  const mes = new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: zona })
    .format(fecha)
    .replace(".", "");
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-2.5">
      <div
        className={[
          "grid h-11 w-11 shrink-0 place-items-center rounded-lg text-center",
          pasada ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
        ].join(" ")}
      >
        <span className="text-sm font-bold leading-none">{dia}</span>
        <span className="text-[9px] font-medium uppercase leading-none opacity-80">{mes}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-foreground">{cita.titulo}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          {horaCorta(cita.inicio, zona)}
          {cita.doctor ? ` · ${cita.doctor.nombre}` : ""}
        </p>
      </div>
      {cita.estado && (
        <Badge tono={tonoEstado(cita.estado)} punto>
          {etiquetaEstado(cita.estado)}
        </Badge>
      )}
    </div>
  );
}

function Citas({ citas, zona, ahora }: { citas: CitaExpediente[]; zona: string; ahora: number }) {
  const proximas = useMemo(
    () =>
      citas
        .filter(
          (cita) =>
            +new Date(cita.inicio) >= ahora &&
            ESTADOS_ACTIVOS.includes(cita.estado ?? "programada"),
        )
        .sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio))
        .slice(0, 3),
    [citas, ahora],
  );
  const pasadas = useMemo(
    () =>
      citas
        .filter((cita) => +new Date(cita.inicio) < ahora)
        .sort((a, b) => +new Date(b.inicio) - +new Date(a.inicio))
        .slice(0, 3),
    [citas, ahora],
  );

  if (proximas.length === 0 && pasadas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
        Sin citas registradas.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {proximas.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Próximas</p>
          {proximas.map((cita) => (
            <FilaCita key={cita.id} cita={cita} zona={zona} />
          ))}
        </div>
      )}
      {pasadas.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recientes</p>
          {pasadas.map((cita) => (
            <FilaCita key={cita.id} cita={cita} zona={zona} pasada />
          ))}
        </div>
      )}
    </div>
  );
}

export function ExpedienteCliente({
  contacto,
  doctores,
  citas,
  citasActivo,
  modo = "clientes",
  zona = ZONA_CITAS,
  soloBasico = false,
}: {
  contacto: {
    id: string;
    nombre: string;
    telefono: string | null;
    email: string | null;
    expediente?: Expediente | null;
  };
  doctores: DoctorCita[];
  citas: CitaExpediente[];
  citasActivo: boolean;
  zona?: string;
  modo?: "clientes" | "pacientes";
  soloBasico?: boolean;
}) {
  const esClinica = modo === "pacientes";
  const expedienteInicial = contacto.expediente;
  const [formulario, setFormulario] = useState({
    fechaNacimiento: valorFecha(expedienteInicial?.fechaNacimiento),
    sexo: expedienteInicial?.sexo ?? "",
    alergias: expedienteInicial?.alergias ?? "",
    antecedentes: expedienteInicial?.antecedentes ?? "",
    medicamentos: expedienteInicial?.medicamentos ?? "",
    observaciones: expedienteInicial?.observaciones ?? "",
  });
  const [evoluciones, setEvoluciones] = useState(expedienteInicial?.evoluciones ?? []);
  const [nota, setNota] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [citaId, setCitaId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [ahora, setAhora] = useState<number | null>(null);

  useEffect(() => {
    setAhora(Date.now());
    const intervalo = window.setInterval(() => setAhora(Date.now()), 60_000);
    return () => window.clearInterval(intervalo);
  }, []);

  const edadPaciente = edad(formulario.fechaNacimiento);
  const siguienteCita =
    ahora === null
      ? undefined
      : citas
          .filter(
            (cita) =>
              +new Date(cita.inicio) >= ahora &&
              ESTADOS_ACTIVOS.includes(cita.estado ?? "programada"),
          )
          .sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio))[0];
  const ultimaVisita = evoluciones[0]?.createdAt;
  const alergiasRelevantes =
    !soloBasico &&
    formulario.alergias.trim() &&
    !["no", "ninguna", "ninguno"].includes(formulario.alergias.trim().toLowerCase());

  function set(campo: keyof typeof formulario, valor: string) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (guardando) return;
    setGuardando(true);
    try {
      const respuesta = await fetch(`/api/contactos/${contacto.id}/expediente`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formulario),
      });
      const payload = await respuesta.json().catch(() => null);
      setGuardando(false);
      if (!respuesta.ok) {
        toast(errorApi(payload, `No se pudo guardar ${esClinica ? "el expediente" : "la ficha"}`), "error");
        return;
      }
      toast(esClinica ? "Expediente guardado" : "Ficha guardada");
    } catch {
      toast("No se pudo guardar. Revisa tu conexión e intenta de nuevo.", "error");
    } finally {
      setGuardando(false);
    }
  }

  async function agregarEvolucion(evento: React.FormEvent) {
    evento.preventDefault();
    if (registrando) return;
    setRegistrando(true);
    try {
      const respuesta = await fetch(`/api/contactos/${contacto.id}/expediente`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenido: nota, doctorId, citaId }),
      });
      const payload = await respuesta.json().catch(() => null);
      setRegistrando(false);
      if (!respuesta.ok) {
        toast(errorApi(payload, `No se pudo registrar ${esClinica ? "la evolución" : "el servicio"}`), "error");
        return;
      }
      setEvoluciones((actuales) => [payload.evolucion, ...actuales]);
      setNota("");
      setCitaId("");
      setDoctorId("");
      toast(esClinica ? "Evolución registrada" : "Atención registrada");
    } catch {
      toast("No se pudo registrar. Revisa tu conexión e intenta de nuevo.", "error");
    } finally {
      setRegistrando(false);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Link
        href={`/${modo}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-primary"
      >
        ← {esClinica ? "Pacientes" : "Clientes"}
      </Link>

      <header className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-gradient text-xl font-bold text-primary-foreground shadow-glow">
            {iniciales(contacto.nombre)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              {esClinica ? "Expediente clínico" : "Ficha de servicio"}
            </p>
            <h1 className="mt-0.5 break-words text-2xl font-bold text-foreground">{contacto.nombre}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
              {edadPaciente !== null && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{edadPaciente} años</span>
              )}
              {formulario.sexo && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{formulario.sexo}</span>
              )}
              {contacto.telefono ? (
                <a
                  href={`tel:${contacto.telefono}`}
                  className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground transition hover:text-primary"
                >
                  +{contacto.telefono}
                </a>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Sin teléfono</span>
              )}
              {contacto.email && (
                <a
                  href={`mailto:${contacto.email}`}
                  className="max-w-full truncate rounded-full bg-muted px-2 py-0.5 text-muted-foreground transition hover:text-primary"
                >
                  {contacto.email}
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {citasActivo && (
              <Link
                href={`/citas?contactoId=${contacto.id}`}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                <IconoReloj className="h-4 w-4" />
                Nueva cita
              </Link>
            )}
            {!soloBasico && (
              <a
                href="#datos-clinicos"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                <IconoEditar className="h-4 w-4" />
                Editar datos
              </a>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-border bg-border/60 sm:grid-cols-4">
          <Dato
            etiqueta="Edad"
            valor={edadPaciente !== null ? `${edadPaciente} años` : "—"}
            detalle={formulario.sexo || "Sin dato"}
          />
          <Dato
            etiqueta="Próxima cita"
            valor={
              ahora === null
                ? "…"
                : siguienteCita
                  ? `${fechaCorta(siguienteCita.inicio, zona)} · ${horaCorta(siguienteCita.inicio, zona)}`
                  : "Sin agendar"
            }
            detalle={
              ahora === null
                ? "Cargando"
                : siguienteCita
                  ? siguienteCita.titulo
                  : citasActivo
                    ? "Agenda una cita"
                    : "Módulo de citas inactivo"
            }
          />
          <Dato
            etiqueta={esClinica ? "Evoluciones" : "Servicios"}
            valor={evoluciones.length}
            detalle="registradas"
          />
          <Dato
            etiqueta="Última visita"
            valor={ultimaVisita ? fechaCorta(ultimaVisita, zona) : "—"}
            detalle={ultimaVisita ? (esClinica ? "última evolución" : "último servicio") : "sin registro"}
          />
        </div>
      </header>

      {alergiasRelevantes && (
        <aside className="flex gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4">
          <IconoAlerta className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-warning">
              {esClinica ? "Alergias a tener en cuenta" : "Sensibilidades a tener en cuenta"}
            </h2>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">{formulario.alergias}</p>
          </div>
        </aside>
      )}

      {soloBasico ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-soft">
            Puedes consultar los datos básicos y gestionar sus citas. El expediente y las evoluciones clínicas están
            disponibles únicamente para puestos autorizados.
          </div>
          <Tarjeta titulo="Citas" descripcion="Próximas y recientes" icono={<IconoReloj className="h-4 w-4" />}>
            {ahora === null ? (
              <p className="text-xs text-muted-foreground">Cargando citas…</p>
            ) : (
              <Citas citas={citas} zona={zona} ahora={ahora} />
            )}
          </Tarjeta>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.72fr)]">
          <div className="space-y-4">
            <Tarjeta
              titulo={esClinica ? "Nueva evolución" : "Registrar atención"}
              descripcion={esClinica ? "Queda en el historial clínico del paciente." : "Queda en el historial de servicios."}
              icono={<IconoNota className="h-4 w-4" />}
            >
              <form onSubmit={agregarEvolucion} className="space-y-3">
                <AreaTexto
                  label={esClinica ? "Nota clínica" : "¿Qué se realizó en esta visita?"}
                  placeholder={
                    esClinica
                      ? "Motivo, hallazgos, tratamiento y recomendaciones."
                      : "Ej. retoque de pestañas, técnica y productos utilizados, tono de gel y cuidados indicados"
                  }
                  value={nota}
                  onChange={setNota}
                  required
                  rows={4}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Selector
                    label={esClinica ? "Doctor" : "Especialista"}
                    value={doctorId}
                    onChange={setDoctorId}
                    disabled={Boolean(citaId)}
                    opciones={doctores.map((doctor) => ({ valor: doctor.id, etiqueta: doctor.nombre }))}
                  />
                  {citasActivo && (
                    <Selector
                      label="Cita relacionada"
                      value={citaId}
                      onChange={(id) => {
                        setCitaId(id);
                        setDoctorId(citas.find((cita) => cita.id === id)?.doctor?.id ?? "");
                      }}
                      opciones={citas.map((cita) => ({
                        valor: cita.id,
                        etiqueta: `${fechaHora(cita.inicio, zona)} · ${cita.titulo}`,
                      }))}
                    />
                  )}
                </div>
                <div className="flex justify-end">
                  <Boton type="submit" disabled={registrando || !nota.trim()}>
                    {registrando ? "Registrando…" : `Registrar ${esClinica ? "evolución" : "atención"}`}
                  </Boton>
                </div>
              </form>
            </Tarjeta>

            <Tarjeta
              titulo={esClinica ? "Historial clínico" : "Historial de servicios"}
              descripcion={`${evoluciones.length} ${evoluciones.length === 1 ? "registro" : "registros"}`}
              icono={<IconoReloj className="h-4 w-4" />}
            >
              {evoluciones.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-5 text-sm text-muted-foreground">
                  Aún no hay {esClinica ? "evoluciones clínicas" : "servicios registrados"}.
                </p>
              ) : (
                <div className="relative space-y-3 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-border">
                  {evoluciones.map((evolucion) => (
                    <article
                      key={evolucion.id}
                      className="relative rounded-xl border border-border/60 bg-background/40 p-3 pl-6"
                    >
                      <span
                        className="absolute left-[1px] top-4 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-card"
                        aria-hidden="true"
                      />
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                        <span className="font-semibold text-foreground">{fechaHora(evolucion.createdAt, zona)}</span>
                        {evolucion.doctor && <span>· {evolucion.doctor.nombre}</span>}
                        {evolucion.cita && <span>· {evolucion.cita.titulo}</span>}
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground">
                        {evolucion.contenido}
                      </p>
                      {evolucion.registradoPor && (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Registrado por {evolucion.registradoPor.nombre}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </Tarjeta>
          </div>

          <aside className="space-y-4">
            <Tarjeta
              id="datos-clinicos"
              titulo={esClinica ? "Datos clínicos" : "Preferencias y cuidados"}
              descripcion={esClinica ? "Se guardan en el expediente del paciente." : "Se guardan en la ficha del cliente."}
              icono={<IconoInfo className="h-4 w-4" />}
            >
              <form onSubmit={guardar} className="space-y-3">
                <AreaTexto
                  label={esClinica ? "Alergias" : "Alergias o sensibilidades"}
                  placeholder="Ej. penicilina, látex, anestesia…"
                  value={formulario.alergias}
                  onChange={(valor) => set("alergias", valor)}
                />
                <AreaTexto
                  label={esClinica ? "Antecedentes clínicos" : "Preferencias de servicio"}
                  placeholder={
                    esClinica
                      ? "Ej. hipertensión, cirugías previas, embarazo…"
                      : "Forma y tonos de uñas, largo o estilo de pestañas, presión del masaje…"
                  }
                  value={formulario.antecedentes}
                  onChange={(valor) => set("antecedentes", valor)}
                />
                <AreaTexto
                  label={esClinica ? "Medicamentos actuales" : "Productos o tratamientos a evitar"}
                  placeholder={
                    esClinica
                      ? "Ej. losartán 50 mg cada 24 h…"
                      : "Productos que le han causado molestias o que prefiere evitar"
                  }
                  value={formulario.medicamentos}
                  onChange={(valor) => set("medicamentos", valor)}
                />
                <AreaTexto
                  label="Observaciones"
                  placeholder="Notas relevantes para la atención."
                  value={formulario.observaciones}
                  onChange={(valor) => set("observaciones", valor)}
                />
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Datos personales
                  </p>
                  <DatosPersonalesFicha
                    clinica={esClinica}
                    fechaNacimiento={formulario.fechaNacimiento}
                    sexo={formulario.sexo}
                    onChange={set}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground">Los cambios se guardan al confirmar.</p>
                  <Boton type="submit" disabled={guardando}>
                    {guardando ? "Guardando…" : `Guardar ${esClinica ? "expediente" : "ficha"}`}
                  </Boton>
                </div>
              </form>
            </Tarjeta>

            <Tarjeta titulo="Citas" descripcion="Próximas y recientes" icono={<IconoReloj className="h-4 w-4" />}>
              {ahora === null ? (
                <p className="text-xs text-muted-foreground">Cargando citas…</p>
              ) : (
                <Citas citas={citas} zona={zona} ahora={ahora} />
              )}
            </Tarjeta>
          </aside>
        </div>
      )}
    </div>
  );
}

function AreaTexto({
  label,
  value,
  onChange,
  required = false,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        rows={rows}
        maxLength={10000}
        placeholder={placeholder}
        value={value}
        required={required}
        onChange={(evento) => onChange(evento.target.value)}
        className={CLASE_CAMPO}
      />
    </label>
  );
}

function Selector({
  label,
  value,
  opciones,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  opciones: { valor: string; etiqueta: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        disabled={disabled}
        value={value}
        onChange={(evento) => onChange(evento.target.value)}
        className={CLASE_CAMPO}
      >
        <option value="">Sin asignar</option>
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.etiqueta}
          </option>
        ))}
      </select>
    </label>
  );
}
