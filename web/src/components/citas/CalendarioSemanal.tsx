"use client";

import { puedeCambiarEstado } from "@/lib/citas-reglas";
import { eventosDelDia } from "./eventos";
import { ventanasCita } from "@/lib/citas-horarios";
import type { DoctorCita } from "./tipos";

import {
  ALTURA_HORA,
  fechaMexicoAUTC,
  HORA_FIN,
  HORA_INICIO,
  inicioDeSemana,
  partesEnZona,
  sumarDias,
  ZONA_CITAS,
} from "@/components/citas/fecha";
import {
  ESTADOS_CITA,
  estiloEstado,
  type Cita,
  type EstadoCita,
} from "@/components/citas/tipos";

function EtiquetaSemana({ semana, zona }: { semana: string; zona: string }) {
  const inicio = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    timeZone: zona,
  }).format(fechaMexicoAUTC(semana, "12:00", zona));
  const fin = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: zona,
  }).format(fechaMexicoAUTC(sumarDias(semana, 6), "12:00", zona));
  return <>{inicio} – {fin}</>;
}

function EventoCalendario({ evento, dia, zona, horaInicio, onSeleccionar }: {
  evento: ReturnType<typeof eventosDelDia>[number]; dia: string; zona: string; horaInicio: number;
  onSeleccionar: (cita: Cita) => void;
}) {
  const { cita, inicio, fin, columna, columnas } = evento;
  const partes = partesEnZona(new Date(inicio), zona);
  const minutos = partes.hour * 60 + partes.minute;
  const partesFin = partesEnZona(new Date(fin), zona);
  const minutosFin = fin >= +fechaMexicoAUTC(sumarDias(dia, 1), "00:00", zona) ? 1440 : partesFin.hour * 60 + partesFin.minute;
  return <button type="button"
    className={`absolute z-10 overflow-hidden rounded-md border-l-4 px-1 py-1 text-left text-xs shadow-sm focus-visible:outline focus-visible:outline-2 ${estiloEstado(cita.estado)}`}
    style={{ top: ((minutos - horaInicio * 60) / 60) * ALTURA_HORA, height: Math.max(18, ((minutosFin - minutos) / 60) * ALTURA_HORA), left: `calc(${columna * 100 / columnas}% + 2px)`, width: `calc(${100 / columnas}% - 4px)`, borderLeftColor: cita.doctor?.color }}
    onClick={(e) => { e.stopPropagation(); onSeleccionar(cita); }}
    title={`${cita.titulo} · ${cita.contacto.nombre} · ${cita.doctor?.nombre ?? "Sin asignar"}`}>
      <span className="block truncate font-semibold">{cita.titulo}</span>
      <span className="block truncate">{String(partes.hour).padStart(2, "0")}:{String(partes.minute).padStart(2, "0")} · {cita.contacto.nombre}</span>
      {cita.doctor && <span className="block truncate">{cita.doctor.nombre}{cita.doctor.activo ? "" : " (inactivo)"}</span>}
    </button>;
}

function ListaCitas({
  citas,
  cargando,
  zona = ZONA_CITAS,
  guardando = false,
  onCambiarEstado,
  onSeleccionar,
  onEliminar,
}: {
  citas: Cita[];
  cargando: boolean;
  zona?: string;
  guardando?: boolean;
  onCambiarEstado: (cita: Cita, estado: EstadoCita) => void;
  onSeleccionar: (cita: Cita) => void;
  onEliminar?: (cita: Cita) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Citas de la semana
        </h2>
        <span className="text-xs text-muted-foreground">
          {cargando ? "Cargando…" : `${citas.length} citas`}
        </span>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {!cargando && citas.length === 0 && (
          <p
            className={[
              "rounded-xl border border-dashed border-border p-5 text-sm",
              "text-muted-foreground",
            ].join(" ")}
          >
            No hay citas en esta semana. Haz clic en un horario del calendario
            para crear la primera.
          </p>
        )}
        {citas.map((cita) => (
          <article
            key={cita.id}
            className={[
              "flex flex-col gap-3 rounded-xl border sm:flex-row sm:items-center sm:justify-between",
              "border-border bg-card p-3",
            ].join(" ")}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground sm:truncate">
                {cita.titulo} · {cita.contacto.nombre}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Intl.DateTimeFormat("es-MX", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: zona,
                }).format(new Date(cita.inicio))}
                {cita.doctor ? ` · ${cita.doctor.nombre}${cita.doctor.activo ? "" : " (inactivo; reasignar)"}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {cita.estado === "cancelada" && onEliminar && <button type="button" disabled={guardando} onClick={() => onEliminar(cita)} className="rounded-lg px-2 py-2 text-xs text-destructive">Eliminar</button>}
              <button
                type="button"
                onClick={() => onSeleccionar(cita)}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium"
              >
                Abrir
              </button>
              <select
                disabled={guardando}
                value={cita.estado}
                onChange={(evento) =>
                  onCambiarEstado(cita, evento.target.value as EstadoCita)
                }
                className="min-w-0 flex-1 rounded-lg border border-input bg-card p-2 text-xs sm:flex-none"
                aria-label={`Estado de ${cita.titulo}`}
              >
                {ESTADOS_CITA.map((estado) => (
                  <option key={estado.valor} value={estado.valor} disabled={!puedeCambiarEstado(cita.estado, estado.valor)}>
                    {estado.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CalendarioSemanal({
  agenda,
  citas,
  cargando,
  zona = ZONA_CITAS,
  guardando = false,
  semana,
  hoy,
  onCambiarSemana,
  onNuevoHorario,
  onCambiarEstado,
  onSeleccionar,
  onEliminar,
}: {
  agenda?: DoctorCita;
  citas: Cita[];
  cargando: boolean;
  zona?: string;
  guardando?: boolean;
  semana: string;
  hoy: string;
  onCambiarSemana: (semana: string) => void;
  onNuevoHorario: (fecha: string, minutos: number) => void;
  onCambiarEstado: (cita: Cita, estado: EstadoCita) => void;
  onSeleccionar: (cita: Cita) => void;
  onEliminar?: (cita: Cita) => void;
}) {
  const dias = Array.from({ length: 7 }, (_, indice) =>
    sumarDias(semana, indice),
  );

  const segmentos = dias.map((dia) => eventosDelDia(citas, dia, zona));
  const jornadas = agenda ? dias.flatMap((dia) => ventanasCita({ horarios: agenda.horarios ?? [], excepciones: agenda.excepciones ?? [] }, dia)) : [];
  const horaInicio = Math.min(HORA_INICIO, ...jornadas.map((v) => Math.floor(v.inicioMin / 60)), ...segmentos.flat().map((e) => partesEnZona(new Date(e.inicio), zona).hour));
  const horaFin = Math.max(HORA_FIN, ...jornadas.map((v) => Math.ceil(v.finMin / 60)), ...segmentos.flat().map((e) => {
    const fin = partesEnZona(new Date(e.fin), zona);
    return fin.hour === 0 && fin.minute === 0 ? 24 : Math.ceil(fin.hour + fin.minute / 60);
  }));
  return (
    <>
      <section
        className={[
          "overflow-hidden rounded-2xl border border-border bg-card",
          "shadow-soft",
        ].join(" ")}
      >
        <div
          className={[
            "flex flex-wrap items-center justify-between gap-3 border-b",
            "border-border p-3",
          ].join(" ")}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onCambiarSemana(sumarDias(semana, -7))}
              className={[
                "grid h-9 w-9 place-items-center rounded-lg border",
                "border-border hover:bg-muted",
              ].join(" ")}
              aria-label="Semana anterior"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => onCambiarSemana(inicioDeSemana(hoy))}
              className={[
                "rounded-lg border border-border px-3 py-2 text-sm",
                "font-medium hover:bg-muted",
              ].join(" ")}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => onCambiarSemana(sumarDias(semana, 7))}
              className={[
                "grid h-9 w-9 place-items-center rounded-lg border",
                "border-border hover:bg-muted",
              ].join(" ")}
              aria-label="Semana siguiente"
            >
              ›
            </button>
          </div>
          <p className="text-sm font-semibold capitalize text-foreground">
            <EtiquetaSemana semana={semana} zona={zona} />
          </p>
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {ESTADOS_CITA.slice(0, 3).map((estado) => (
              <span key={estado.valor} className="flex items-center gap-1">
                <span
                  className={`h-2.5 w-2.5 rounded-full border ${estiloEstado(
                    estado.valor,
                  )}`}
                />
                {estado.etiqueta}
              </span>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div
              className="grid border-b border-border bg-background/70"
              style={{
                gridTemplateColumns: "64px repeat(7, minmax(0, 1fr))",
              }}
            >
              <div className="border-r border-border" />
              {dias.map((dia) => {
                const fecha = fechaMexicoAUTC(dia, "12:00", zona);
                const esHoy = dia === hoy;
                return (
                  <div
                    key={dia}
                    className={[
                      "border-r border-border px-2 py-3 text-center",
                      "last:border-r-0",
                      esHoy ? "bg-primary/5" : "",
                    ].join(" ")}
                  >
                    <p
                      className={[
                        "text-[11px] font-semibold uppercase",
                        "text-muted-foreground",
                      ].join(" ")}
                    >
                      {new Intl.DateTimeFormat("es-MX", {
                        weekday: "short",
                        timeZone: zona,
                      }).format(fecha)}
                    </p>
                    <p
                      className={[
                        "mx-auto mt-1 grid h-8 w-8 place-items-center",
                        "rounded-full text-sm font-bold",
                        esHoy
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground",
                      ].join(" ")}
                    >
                      {new Intl.DateTimeFormat("es-MX", {
                        day: "numeric",
                        timeZone: zona,
                      }).format(fecha)}
                    </p>
                  </div>
                );
              })}
            </div>

            <div
              className="relative"
              style={{ height: (horaFin - horaInicio) * ALTURA_HORA }}
            >
              {Array.from(
                { length: horaFin - horaInicio + 1 },
                (_, indice) => horaInicio + indice,
              ).map((hora) => (
                <div
                  key={hora}
                  className="absolute inset-x-0 border-t border-border/70"
                  style={{ top: (hora - horaInicio) * ALTURA_HORA }}
                >
                  <span
                    className={[
                      "absolute -top-2.5 left-2 bg-card pr-2 text-[10px]",
                      "text-muted-foreground",
                    ].join(" ")}
                  >
                    {String(hora).padStart(2, "0")}:00
                  </span>
                </div>
              ))}

              <div
                className={[
                  "absolute inset-y-0 left-16 right-0 grid",
                  "grid-cols-7",
                ].join(" ")}
              >
                {dias.map((dia) => (
                  <div
                    key={dia}
                    className={[
                      "relative border-l border-border text-left",
                      dia === hoy ? "bg-primary/[.025]" : "",
                    ].join(" ")}
                    onClick={(evento) => {
                      const rect = evento.currentTarget.getBoundingClientRect();
                      const minutos =
                        horaInicio * 60 +
                        Math.round(
                          ((evento.clientY - rect.top) / ALTURA_HORA) * 2,
                        ) *
                          30;
                      onNuevoHorario(dia, minutos);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onNuevoHorario(dia, horaInicio * 60); } }}
                    aria-label={`Crear cita el ${dia}`}
                    title={`Crear cita el ${dia}`}
                  >
                    {agenda?.horarios?.length ? (() => {
                      const ventanas = ventanasCita({ horarios: agenda.horarios, excepciones: agenda.excepciones ?? [] }, dia);
                      const tramos = Array.from({ length: (horaFin - horaInicio) * 12 }, (_, indice) => horaInicio * 60 + indice * 5);
                      return tramos.filter((minuto) => !ventanas.some((ventana) => minuto >= ventana.inicioMin && minuto + 5 <= ventana.finMin)).map((minuto) => <div key={minuto} aria-hidden="true" className="pointer-events-none absolute inset-x-0 bg-muted/80" style={{ top: (minuto / 60 - horaInicio) * ALTURA_HORA, height: ALTURA_HORA / 12 }} />);
                    })() : null}
                    {eventosDelDia(citas, dia, zona).map((evento) => (
                      <EventoCalendario key={evento.cita.id} evento={evento} dia={dia} zona={zona} horaInicio={horaInicio} onSeleccionar={onSeleccionar} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <ListaCitas
        onEliminar={onEliminar}
        citas={citas}
        cargando={cargando}
        zona={zona}
        guardando={guardando}
        onCambiarEstado={onCambiarEstado}
        onSeleccionar={onSeleccionar}
      />
    </>
  );
}
