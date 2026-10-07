"use client";

import {
  ALTURA_HORA,
  claveFecha,
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

function EtiquetaSemana({ semana }: { semana: string }) {
  const inicio = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    timeZone: ZONA_CITAS,
  }).format(fechaMexicoAUTC(semana, "12:00"));
  const fin = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: ZONA_CITAS,
  }).format(fechaMexicoAUTC(sumarDias(semana, 6), "12:00"));
  return <>{inicio} – {fin}</>;
}

function EventoCalendario({ cita }: { cita: Cita }) {
  const partes = partesEnZona(new Date(cita.inicio));
  const minutoInicio = partes.hour * 60 + partes.minute;
  const duracion = Math.max(
    30,
    (new Date(cita.fin).getTime() - new Date(cita.inicio).getTime()) / 60_000,
  );
  const top = Math.max(
    0,
    ((minutoInicio - HORA_INICIO * 60) / 60) * ALTURA_HORA,
  );
  const altoDisponible =
    (HORA_FIN - HORA_INICIO) * ALTURA_HORA - Math.min(top, 738);
  const alto = Math.max(
    30,
    Math.min((duracion / 60) * ALTURA_HORA, altoDisponible),
  );

  return (
    <span
      className={[
        "absolute inset-x-1 z-10 overflow-hidden rounded-md border-l-4",
        "px-2 py-1 text-xs shadow-sm",
        estiloEstado(cita.estado),
      ].join(" ")}
      style={{ top: Math.min(top, 738), height: alto }}
      onClick={(evento) => evento.stopPropagation()}
      title={`${cita.titulo} · ${cita.contacto.nombre}`}
    >
      <span className="block truncate font-semibold">{cita.titulo}</span>
      <span className="block truncate opacity-80">
        {String(partes.hour).padStart(2, "0")}:
        {String(partes.minute).padStart(2, "0")} · {cita.contacto.nombre}
      </span>
    </span>
  );
}

function ListaCitas({
  citas,
  cargando,
  onCambiarEstado,
}: {
  citas: Cita[];
  cargando: boolean;
  onCambiarEstado: (cita: Cita, estado: EstadoCita) => void;
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
              "flex items-center justify-between gap-3 rounded-xl border",
              "border-border bg-card p-3",
            ].join(" ")}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {cita.titulo} · {cita.contacto.nombre}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Intl.DateTimeFormat("es-MX", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: ZONA_CITAS,
                }).format(new Date(cita.inicio))}
                {cita.responsable ? ` · ${cita.responsable.nombre}` : ""}
              </p>
            </div>
            <select
              value={cita.estado}
              onChange={(evento) =>
                onCambiarEstado(cita, evento.target.value as EstadoCita)
              }
              className="shrink-0 rounded-lg border border-input bg-card p-2 text-xs"
              aria-label={`Estado de ${cita.titulo}`}
            >
              {ESTADOS_CITA.map((estado) => (
                <option key={estado.valor} value={estado.valor}>
                  {estado.etiqueta}
                </option>
              ))}
            </select>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CalendarioSemanal({
  citas,
  cargando,
  semana,
  hoy,
  onCambiarSemana,
  onNuevoHorario,
  onCambiarEstado,
}: {
  citas: Cita[];
  cargando: boolean;
  semana: string;
  hoy: string;
  onCambiarSemana: (semana: string) => void;
  onNuevoHorario: (fecha: string, minutos: number) => void;
  onCambiarEstado: (cita: Cita, estado: EstadoCita) => void;
}) {
  const dias = Array.from({ length: 7 }, (_, indice) =>
    sumarDias(semana, indice),
  );

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
            <EtiquetaSemana semana={semana} />
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
                const fecha = fechaMexicoAUTC(dia, "12:00");
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
                        timeZone: ZONA_CITAS,
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
                        timeZone: ZONA_CITAS,
                      }).format(fecha)}
                    </p>
                  </div>
                );
              })}
            </div>

            <div
              className="relative"
              style={{ height: (HORA_FIN - HORA_INICIO) * ALTURA_HORA }}
            >
              {Array.from(
                { length: HORA_FIN - HORA_INICIO + 1 },
                (_, indice) => HORA_INICIO + indice,
              ).map((hora) => (
                <div
                  key={hora}
                  className="absolute inset-x-0 border-t border-border/70"
                  style={{ top: (hora - HORA_INICIO) * ALTURA_HORA }}
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
                  <button
                    key={dia}
                    type="button"
                    className={[
                      "relative border-l border-border text-left",
                      dia === hoy ? "bg-primary/[.025]" : "",
                    ].join(" ")}
                    onClick={(evento) => {
                      const rect = evento.currentTarget.getBoundingClientRect();
                      const minutos =
                        HORA_INICIO * 60 +
                        Math.round(
                          ((evento.clientY - rect.top) / ALTURA_HORA) * 2,
                        ) *
                          30;
                      onNuevoHorario(dia, minutos);
                    }}
                    aria-label={`Crear cita el ${dia}`}
                  >
                    {citas
                      .filter(
                        (cita) => claveFecha(new Date(cita.inicio)) === dia,
                      )
                      .map((cita) => (
                        <EventoCalendario key={cita.id} cita={cita} />
                      ))}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <ListaCitas
        citas={citas}
        cargando={cargando}
        onCambiarEstado={onCambiarEstado}
      />
    </>
  );
}
