"use client";

import { useEffect, useMemo, useState } from "react";
import { IconoChevronDerecha, IconoChevronIzquierda } from "@/components/icons";
import { ventanasCita } from "@/lib/citas-horarios";
import { eventosDelDia } from "./eventos";
import type { DoctorCita } from "./tipos";
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
import type { Cita, EstadoCita } from "@/components/citas/tipos";

const PUNTO_ESTADO: Record<EstadoCita, string> = {
  programada: "bg-info",
  confirmada: "bg-success",
  en_sala: "bg-primary",
  completada: "bg-muted-foreground",
  cancelada: "bg-destructive",
  no_asistio: "bg-warning",
};

const ETIQUETA_ESTADO: Record<EstadoCita, string> = {
  programada: "Programada",
  confirmada: "Confirmada",
  en_sala: "En sala",
  completada: "Completada",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

const COLOR_RESPALDO = "#0ea5e9";

type Segmento = ReturnType<typeof eventosDelDia>[number];

function minutosDe(fecha: Date, zona: string) {
  const partes = partesEnZona(fecha, zona);
  return partes.hour * 60 + partes.minute;
}

function horaTexto(minutos: number) {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(
    minutos % 60,
  ).padStart(2, "0")}`;
}

function colorDe(cita: Cita) {
  const color = cita.doctor?.color;
  return color?.startsWith("#") ? color : COLOR_RESPALDO;
}

function rangoSemana(semana: string, zona: string) {
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
  return `${inicio} – ${fin}`;
}

function tituloMes(semana: string, zona: string) {
  const texto = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: zona,
  }).format(fechaMexicoAUTC(semana, "12:00", zona));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function tituloDia(dia: string, zona: string) {
  const texto = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: zona,
  }).format(fechaMexicoAUTC(dia, "12:00", zona));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function esFinDeSemana(dia: string) {
  const numero = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return numero === 0 || numero === 6;
}

function franjasFuera(
  ventanas: { inicioMin: number; finMin: number }[],
  desde: number,
  hasta: number,
) {
  const ordenadas = [...ventanas].sort((a, b) => a.inicioMin - b.inicioMin);
  const resultado: { inicio: number; fin: number }[] = [];
  let cursor = desde;
  for (const ventana of ordenadas) {
    const inicio = Math.max(desde, ventana.inicioMin);
    const fin = Math.min(hasta, ventana.finMin);
    if (fin <= cursor) continue;
    if (inicio > cursor) resultado.push({ inicio: cursor, fin: Math.min(inicio, hasta) });
    cursor = Math.max(cursor, fin);
    if (cursor >= hasta) break;
  }
  if (cursor < hasta) resultado.push({ inicio: cursor, fin: hasta });
  return resultado;
}

function IconoBoton({
  etiqueta,
  onClick,
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className="grid h-8 w-8 place-items-center rounded-full border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      {children}
    </button>
  );
}

function EventoCalendario({
  evento,
  dia,
  zona,
  horaInicio,
  onSeleccionar,
}: {
  evento: Segmento;
  dia: string;
  zona: string;
  horaInicio: number;
  onSeleccionar: (cita: Cita) => void;
}) {
  const { cita, inicio, fin, columna, columnas } = evento;
  const partes = partesEnZona(new Date(inicio), zona);
  const minutos = partes.hour * 60 + partes.minute;
  const finDelDia = +fechaMexicoAUTC(sumarDias(dia, 1), "00:00", zona);
  const minutosFin = fin >= finDelDia ? 1440 : minutosDe(new Date(fin), zona);
  const alto = Math.max(20, ((minutosFin - minutos) / 60) * ALTURA_HORA);
  const mostrarHora = alto >= 28;
  const mostrarPaciente = alto >= 44;
  const mostrarDoctor = alto >= 60;
  const color = colorDe(cita);
  const cancelada = cita.estado === "cancelada";
  const completada = cita.estado === "completada";
  const etiqueta = `${cita.titulo} · ${cita.contacto.nombre} · ${horaTexto(minutos)} a ${horaTexto(minutosFin)} · ${ETIQUETA_ESTADO[cita.estado]}`;

  return (
    <button
      type="button"
      className={[
        "group absolute z-10 overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 text-left shadow-sm outline-none transition",
        "hover:z-30 hover:-translate-y-px hover:shadow-lift focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-primary/60",
        cancelada ? "line-through opacity-60" : "",
        completada ? "opacity-70" : "",
      ].join(" ")}
      style={{
        top: ((minutos - horaInicio * 60) / 60) * ALTURA_HORA,
        height: alto,
        left: `calc(${(columna * 100) / columnas}% + 2px)`,
        width: `calc(${100 / columnas}% - 4px)`,
        borderLeftColor: color,
        backgroundColor: `${color}18`,
      }}
      onClick={(eventoClick) => {
        eventoClick.stopPropagation();
        onSeleccionar(cita);
      }}
      aria-label={etiqueta}
      title={etiqueta}
    >
      <span
        className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${PUNTO_ESTADO[cita.estado]}`}
        aria-hidden="true"
      />
      <span className="block pr-2 text-[11px] font-semibold leading-tight text-foreground">
        {cita.titulo}
      </span>
      {mostrarHora && (
        <span className="mt-0.5 block text-[10px] font-medium leading-tight text-foreground/70">
          {horaTexto(minutos)} – {horaTexto(minutosFin)}
        </span>
      )}
      {mostrarPaciente && (
        <span className="block truncate text-[10px] leading-tight text-foreground/80">
          {cita.contacto.nombre}
        </span>
      )}
      {mostrarDoctor && cita.doctor && (
        <span className="flex items-center gap-1 truncate text-[10px] leading-tight text-foreground/60">
          <span className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate">{cita.doctor.nombre}</span>
        </span>
      )}
    </button>
  );
}

function MiniMes({
  semana,
  diaSeleccionado,
  hoy,
  citas,
  zona,
  onDia,
}: {
  semana: string;
  diaSeleccionado: string;
  hoy: string;
  citas: Cita[];
  zona: string;
  onDia: (dia: string) => void;
}) {
  const [mes, setMes] = useState(semana.slice(0, 7));

  useEffect(() => {
    setMes(semana.slice(0, 7));
  }, [semana]);

  const puntos = useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const cita of citas) {
      const clave = claveFecha(new Date(cita.inicio), zona);
      const colores = mapa.get(clave) ?? [];
      colores.push(colorDe(cita));
      mapa.set(clave, colores);
    }
    return mapa;
  }, [citas, zona]);

  const [anio, numeroMes] = mes.split("-").map(Number);
  const primero = new Date(Date.UTC(anio, numeroMes - 1, 1));
  const desplazamiento = (primero.getUTCDay() + 6) % 7;
  const totalDias = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
  const celdas: (string | null)[] = [
    ...Array.from({ length: desplazamiento }, () => null),
    ...Array.from({ length: totalDias }, (_, indice) =>
      `${mes}-${String(indice + 1).padStart(2, "0")}`,
    ),
  ];
  while (celdas.length % 7 !== 0) celdas.push(null);

  const etiqueta = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(primero);
  const etiquetaCapital = etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);

  function moverMes(delta: number) {
    const siguiente = new Date(Date.UTC(anio, numeroMes - 1 + delta, 1));
    setMes(siguiente.toISOString().slice(0, 7));
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{etiquetaCapital}</h3>
        <div className="flex items-center gap-0.5">
          <IconoBoton etiqueta="Mes anterior" onClick={() => moverMes(-1)}>
            <IconoChevronIzquierda className="h-4 w-4" />
          </IconoBoton>
          <IconoBoton etiqueta="Mes siguiente" onClick={() => moverMes(1)}>
            <IconoChevronDerecha className="h-4 w-4" />
          </IconoBoton>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {["L", "M", "M", "J", "V", "S", "D"].map((letra, indice) => (
          <span
            key={`${letra}-${indice}`}
            className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {letra}
          </span>
        ))}
        {celdas.map((dia, indice) => {
          if (!dia) return <span key={`vacio-${indice}`} />;
          const numero = Number(dia.slice(-2));
          const esHoy = dia === hoy;
          const seleccionado = dia === diaSeleccionado;
          const colores = puntos.get(dia) ?? [];
          return (
            <button
              key={dia}
              type="button"
              onClick={() => onDia(dia)}
              aria-label={dia}
              aria-pressed={seleccionado}
              className={[
                "relative mx-auto flex h-8 w-8 flex-col items-center justify-center rounded-full text-[11px] transition",
                seleccionado
                  ? "bg-primary font-semibold text-primary-foreground"
                  : esHoy
                    ? "font-semibold text-primary ring-1 ring-primary/50"
                    : "text-foreground/80 hover:bg-muted",
              ].join(" ")}
            >
              <span className="tnum leading-none">{numero}</span>
              {colores.length > 0 && (
                <span className="absolute bottom-0.5 flex gap-0.5" aria-hidden="true">
                  {[...new Set(colores)].slice(0, 3).map((color) => (
                    <span
                      key={color}
                      className="h-1 w-1 rounded-full"
                      style={{ backgroundColor: seleccionado ? "currentColor" : color }}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AgendaDelDia({
  dia,
  hoy,
  citas,
  zona,
  cargando,
  onSeleccionar,
}: {
  dia: string;
  hoy: string;
  citas: Cita[];
  zona: string;
  cargando: boolean;
  onSeleccionar: (cita: Cita) => void;
}) {
  const delDia = useMemo(() => {
    const desde = +fechaMexicoAUTC(dia, "00:00", zona);
    const hasta = +fechaMexicoAUTC(sumarDias(dia, 1), "00:00", zona);
    return citas
      .filter((cita) => +new Date(cita.inicio) < hasta && +new Date(cita.fin) > desde)
      .sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio));
  }, [citas, dia, zona]);

  const etiquetaDia = useMemo(() => {
    const texto = new Intl.DateTimeFormat("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "short",
      timeZone: zona,
    }).format(fechaMexicoAUTC(dia, "12:00", zona));
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }, [dia, zona]);

  return (
    <section className="rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {dia === hoy ? "Hoy" : "Agenda del día"}
          </p>
          <h3 className="truncate text-sm font-semibold text-foreground">{etiquetaDia}</h3>
        </div>
        <span className="mt-0.5 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {delDia.length} {delDia.length === 1 ? "cita" : "citas"}
        </span>
      </div>

      {cargando && delDia.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2].map((indice) => (
            <div key={indice} className="flex gap-2">
              <span className="h-8 w-10 shrink-0 animate-pulse rounded bg-muted" />
              <span className="h-8 flex-1 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : delDia.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
          Sin citas este día. Haz clic en un horario del calendario para crear una.
        </p>
      ) : (
        <div className="space-y-0.5">
          {delDia.map((cita) => {
            const inicio = new Date(cita.inicio);
            const fin = new Date(cita.fin);
            const minutero = minutosDe(inicio, zona);
            const finMin = minutosDe(fin, zona);
            const color = colorDe(cita);
            return (
              <button
                key={cita.id}
                type="button"
                onClick={() => onSeleccionar(cita)}
                className="group flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none"
              >
                <span className="w-10 shrink-0 pt-0.5 text-right text-[10px] font-medium tnum text-muted-foreground">
                  {horaTexto(minutero)}
                </span>
                <span
                  className="mt-0.5 h-8 w-[3px] shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-foreground">
                      {cita.titulo}
                    </span>
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO_ESTADO[cita.estado]}`}
                      title={ETIQUETA_ESTADO[cita.estado]}
                    />
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {cita.contacto.nombre}
                    {cita.doctor ? ` · ${cita.doctor.nombre}` : ""}
                  </span>
                  <span className="block text-[10px] text-muted-foreground/70">
                    {horaTexto(minutero)} – {horaTexto(finMin === 0 ? 1440 : finMin)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function CalendarioSemanal({
  agenda,
  citas,
  cargando,
  zona = ZONA_CITAS,
  semana,
  hoy,
  onCambiarSemana,
  onNuevoHorario,
  onSeleccionar,
}: {
  agenda?: DoctorCita;
  citas: Cita[];
  cargando: boolean;
  zona?: string;
  semana: string;
  hoy: string;
  onCambiarSemana: (semana: string) => void;
  onNuevoHorario: (fecha: string, minutos: number) => void;
  onSeleccionar: (cita: Cita) => void;
}) {
  const [vista, setVista] = useState<"semana" | "dia">("semana");
  const [diaSeleccionado, setDiaSeleccionado] = useState(hoy);
  const [ahora, setAhora] = useState<Date | null>(null);

  useEffect(() => {
    setAhora(new Date());
    const intervalo = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(intervalo);
  }, []);

  const dias = useMemo(
    () => Array.from({ length: 7 }, (_, indice) => sumarDias(semana, indice)),
    [semana],
  );

  useEffect(() => {
    setDiaSeleccionado((actual) =>
      dias.includes(actual) ? actual : dias.includes(hoy) ? hoy : semana,
    );
  }, [dias, hoy, semana]);

  const diasVisibles = vista === "semana" ? dias : [diaSeleccionado];
  const segmentos = diasVisibles.map((dia) => eventosDelDia(citas, dia, zona));
  const jornadas = agenda
    ? diasVisibles.flatMap((dia) =>
        ventanasCita(
          { horarios: agenda.horarios ?? [], excepciones: agenda.excepciones ?? [] },
          dia,
        ),
      )
    : [];

  const horasEventos = segmentos.flatMap((eventos) =>
    eventos.flatMap((evento) => {
      const inicio = partesEnZona(new Date(evento.inicio), zona).hour;
      const finPartes = partesEnZona(new Date(evento.fin), zona);
      const fin = finPartes.hour === 0 && finPartes.minute === 0 ? 24 : Math.ceil(finPartes.hour + finPartes.minute / 60);
      return [inicio, fin];
    }),
  );

  const horaInicio = Math.max(
    0,
    Math.min(
      HORA_INICIO,
      ...jornadas.map((ventana) => Math.floor(ventana.inicioMin / 60)),
      ...horasEventos,
    ),
  );
  const horaFin = Math.max(
    HORA_FIN,
    ...jornadas.map((ventana) => Math.ceil(ventana.finMin / 60)),
    ...horasEventos,
  );
  const horas = Array.from(
    { length: horaFin - horaInicio + 1 },
    (_, indice) => horaInicio + indice,
  );
  const columnas = `64px repeat(${diasVisibles.length}, minmax(0, 1fr))`;
  const alturaTotal = (horaFin - horaInicio) * ALTURA_HORA;
  const ahoraMinutos = ahora ? minutosDe(ahora, zona) : null;
  const mostrarAhora =
    ahoraMinutos !== null &&
    diasVisibles.includes(hoy) &&
    ahoraMinutos >= horaInicio * 60 &&
    ahoraMinutos <= horaFin * 60;
  const topAhora = ahoraMinutos !== null ? ((ahoraMinutos - horaInicio * 60) / 60) * ALTURA_HORA : 0;

  const doctores = useMemo(() => {
    const mapa = new Map<string, { nombre: string; color: string }>();
    for (const cita of citas) {
      if (cita.doctor) mapa.set(cita.doctor.id, { nombre: cita.doctor.nombre, color: cita.doctor.color });
    }
    return [...mapa.values()];
  }, [citas]);

  function moverSemana(delta: number) {
    const indice = Math.max(0, dias.indexOf(diaSeleccionado));
    const nueva = sumarDias(semana, delta * 7);
    onCambiarSemana(nueva);
    setDiaSeleccionado(sumarDias(nueva, indice));
  }

  function irHoy() {
    onCambiarSemana(inicioDeSemana(hoy));
    setDiaSeleccionado(hoy);
  }

  function elegirDia(dia: string) {
    setDiaSeleccionado(dia);
    if (!dias.includes(dia)) onCambiarSemana(inicioDeSemana(dia));
  }

  function cambiarVista(nueva: "semana" | "dia") {
    if (nueva === "dia" && !dias.includes(diaSeleccionado)) {
      setDiaSeleccionado(dias.includes(hoy) ? hoy : semana);
    }
    setVista(nueva);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-1">
            <IconoBoton etiqueta="Anterior" onClick={() => moverSemana(-1)}>
              <IconoChevronIzquierda className="h-4 w-4" />
            </IconoBoton>
            <button
              type="button"
              onClick={irHoy}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
            >
              Hoy
            </button>
            <IconoBoton etiqueta="Siguiente" onClick={() => moverSemana(1)}>
              <IconoChevronDerecha className="h-4 w-4" />
            </IconoBoton>
            <div className="ml-1 min-w-0">
              <h2 className="truncate text-base font-semibold text-foreground sm:text-lg">
                {vista === "dia" ? tituloDia(diaSeleccionado, zona) : tituloMes(semana, zona)}
              </h2>
              <p className="truncate text-[11px] text-muted-foreground">
                {vista === "dia" ? "Vista de día" : rangoSemana(semana, zona)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {cargando && (
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
                aria-label="Cargando citas"
              />
            )}
            <div className="flex rounded-full border border-border bg-muted/50 p-0.5 text-[11px] font-medium">
              {(["dia", "semana"] as const).map((opcion) => (
                <button
                  key={opcion}
                  type="button"
                  onClick={() => cambiarVista(opcion)}
                  aria-pressed={vista === opcion}
                  className={[
                    "rounded-full px-2.5 py-1 capitalize transition",
                    vista === opcion
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {opcion}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-border bg-background/50 px-3 py-1.5">
          <span className="truncate text-[11px] text-muted-foreground">
            {vista === "dia" ? rangoSemana(semana, zona) : `${citas.length} citas en la semana`}
          </span>
          {doctores.length > 0 && (
            <div className="hidden items-center gap-3 md:flex">
              {doctores.slice(0, 5).map((doctor) => (
                <span key={doctor.nombre} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: doctor.color }} />
                  <span className="max-w-[120px] truncate">{doctor.nombre}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="relative max-h-[68vh] overflow-auto">
          <div className="min-w-[880px]">
            <div
              className="sticky top-0 z-30 grid border-b border-border bg-card/95 backdrop-blur"
              style={{ gridTemplateColumns: columnas }}
            >
              <div className="border-r border-border/60" />
              {diasVisibles.map((dia) => {
                const fecha = fechaMexicoAUTC(dia, "12:00", zona);
                const diaHoy = dia === hoy;
                const seleccionado = dia === diaSeleccionado;
                const finde = esFinDeSemana(dia);
                return (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => setDiaSeleccionado(dia)}
                    className={[
                      "border-r border-border/60 px-1 py-2 text-center transition last:border-r-0",
                      finde ? "bg-muted/25" : "",
                      diaHoy ? "bg-primary/[0.04]" : seleccionado ? "bg-primary/[0.03]" : "",
                    ].join(" ")}
                    aria-label={`Seleccionar ${tituloDia(dia, zona)}`}
                    aria-pressed={seleccionado}
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone: zona }).format(fecha)}
                    </span>
                    <span
                      className={[
                        "mx-auto mt-0.5 grid h-8 w-8 place-items-center rounded-full text-sm font-semibold tnum transition",
                        diaHoy
                          ? "bg-primary text-primary-foreground shadow-glow"
                          : seleccionado
                            ? "bg-primary/10 text-primary"
                            : "text-foreground",
                      ].join(" ")}
                    >
                      {new Intl.DateTimeFormat("es-MX", { day: "numeric", timeZone: zona }).format(fecha)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative" style={{ height: alturaTotal }}>
              {horas.map((hora) => (
                <div
                  key={`hora-${hora}`}
                  className="absolute inset-x-0 border-t border-border/60"
                  style={{ top: (hora - horaInicio) * ALTURA_HORA }}
                >
                  <span className="absolute -top-2 left-0 w-14 pr-2 text-right text-[10px] tnum text-muted-foreground">
                    {String(hora).padStart(2, "0")}:00
                  </span>
                </div>
              ))}
              {horas.slice(0, -1).map((hora) => (
                <div
                  key={`media-${hora}`}
                  className="absolute inset-x-0 border-t border-dashed border-border/35"
                  style={{ top: (hora - horaInicio + 0.5) * ALTURA_HORA }}
                />
              ))}

              <div
                className="absolute inset-y-0 left-16 right-0 grid"
                style={{ gridTemplateColumns: `repeat(${diasVisibles.length}, minmax(0, 1fr))` }}
              >
                {diasVisibles.map((dia, indice) => {
                  const finde = esFinDeSemana(dia);
                  const diaHoy = dia === hoy;
                  const seleccionado = dia === diaSeleccionado;
                  const ventanas = agenda
                    ? ventanasCita(
                        { horarios: agenda.horarios ?? [], excepciones: agenda.excepciones ?? [] },
                        dia,
                      )
                    : [];
                  const fuera = agenda ? franjasFuera(ventanas, horaInicio * 60, horaFin * 60) : [];
                  return (
                    <div
                      key={dia}
                      className={[
                        "relative border-l border-border/60 transition-colors",
                        finde ? "bg-muted/15" : "",
                        diaHoy ? "bg-primary/[0.02]" : seleccionado ? "bg-primary/[0.02]" : "",
                        "cursor-pointer hover:bg-primary/[0.035]",
                      ].join(" ")}
                      onClick={(evento) => {
                        const rect = evento.currentTarget.getBoundingClientRect();
                        const minutos =
                          horaInicio * 60 +
                          Math.round(((evento.clientY - rect.top) / ALTURA_HORA) * 2) * 30;
                        onNuevoHorario(dia, Math.max(0, Math.min(24 * 60 - 30, minutos)));
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(evento) => {
                        if (evento.target === evento.currentTarget && (evento.key === "Enter" || evento.key === " ")) {
                          evento.preventDefault();
                          onNuevoHorario(dia, horaInicio * 60);
                        }
                      }}
                      aria-label={`Crear cita el ${dia}`}
                      title={`Crear cita el ${dia}`}
                    >
                      {fuera.map((franja) => (
                        <div
                          key={`${dia}-${franja.inicio}`}
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-0 bg-muted/40"
                          style={{
                            top: ((franja.inicio - horaInicio * 60) / 60) * ALTURA_HORA,
                            height: ((franja.fin - franja.inicio) / 60) * ALTURA_HORA,
                          }}
                        />
                      ))}

                      {mostrarAhora && indice === diasVisibles.indexOf(hoy) && (
                        <div
                          className="pointer-events-none absolute inset-x-0 z-20"
                          style={{ top: topAhora }}
                          aria-hidden="true"
                        >
                          <div className="h-[2px] bg-red-500/90" />
                          <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-red-500 ring-2 ring-card" />
                        </div>
                      )}

                      {segmentos[indice].map((evento) => (
                        <EventoCalendario
                          key={evento.cita.id}
                          evento={evento}
                          dia={dia}
                          zona={zona}
                          horaInicio={horaInicio}
                          onSeleccionar={onSeleccionar}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <MiniMes
          semana={semana}
          diaSeleccionado={diaSeleccionado}
          hoy={hoy}
          citas={citas}
          zona={zona}
          onDia={elegirDia}
        />
        <AgendaDelDia
          dia={diaSeleccionado}
          hoy={hoy}
          citas={citas}
          zona={zona}
          cargando={cargando}
          onSeleccionar={onSeleccionar}
        />
      </aside>
    </div>
  );
}
