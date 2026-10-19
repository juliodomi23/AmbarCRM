"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Doctor = { id: string; nombre: string };
type Servicio = { id: string; nombre: string; descripcion: string | null; duracionMin: number; precio: number; doctores: Doctor[] };
type Datos = { negocio: { nombre: string; logo: string | null }; zona: string; servicios: Servicio[] };
type Etapa = "servicio" | "especialista" | "fecha" | "hora" | "datos";
type Confirmada = { token: string; inicio: string; especialista: string | null; servicio: string };

const SIN_PREFERENCIA = "cualquiera";
const moneda = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

/** Asistente público de reservas: servicio → especialista → día → hora → datos. */
export function ReservaPublica({ slug }: { slug: string }) {
  const [etapa, setEtapa] = useState<Etapa>("servicio");
  const panel = useRef<HTMLDivElement>(null);
  const avisoError = useRef<HTMLParagraphElement>(null);
  const cargaDias = useRef(0);
  const cargaHoras = useRef(0);
  const base = `/api/public/reservas/${encodeURIComponent(slug)}`;
  const [datos, setDatos] = useState<Datos | null>(null);
  const [revision, setRevision] = useState(0);
  const [cargandoDias, setCargandoDias] = useState(false);
  const [error, setError] = useState("");
  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [doctor, setDoctor] = useState<string | null>(null);
  const [dias, setDias] = useState<string[] | null>(null);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [horarios, setHorarios] = useState<string[] | null>(null);
  const [horario, setHorario] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [confirmada, setConfirmada] = useState<Confirmada | null>(null);

  useEffect(() => { panel.current?.focus(); }, [etapa]);

  useEffect(() => {
    if (!error) return;
    avisoError.current?.focus();
  }, [error]);

  useEffect(() => {
    const abort = new AbortController();
    setError("");
    void fetch(base, { signal: abort.signal }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (abort.signal.aborted) return;
      if (res.ok) setDatos(data);
      else setError(data.error ?? "No se pudo cargar la agenda");
    }).catch(() => { if (!abort.signal.aborted) setError("No se pudo cargar la agenda. Revisa tu conexión."); });
    return () => abort.abort();
  }, [base, revision]);

  const formato = useCallback(
    (iso: string, opciones: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("es-MX", { timeZone: datos?.zona, ...opciones }).format(new Date(iso)),
    [datos?.zona],
  );
  const textoDia = (dia: string) =>
    new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${dia}T12:00:00Z`));

  async function cargarDias(servicioId: string, doctorId: string, desde?: string) {
    const turno = ++cargaDias.current;
    setCargandoDias(true);
    setError("");
    try {
      const q = new URLSearchParams({ servicio: servicioId, doctor: doctorId, ...(desde ? { desde } : {}) });
      const res = await fetch(`${base}/horarios?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar los días disponibles");
      if (turno !== cargaDias.current) return;
      setDias((previos) => (desde ? [...(previos ?? []), ...data.dias] : data.dias));
      setSiguiente(data.siguiente ?? null);
    } catch (error) { if (turno === cargaDias.current) { setDias([]); setError(error instanceof Error ? error.message : "No se pudieron cargar los días"); } }
    finally { if (turno === cargaDias.current) setCargandoDias(false); }
  }

  async function cargarHorarios(dia: string, conservarError = false) {
    if (!servicio || !doctor) return;
    const turno = ++cargaHoras.current;
    setFecha(dia); setHorario(null); setHorarios(null);
    if (!conservarError) setError("");
    try {
      const q = new URLSearchParams({ servicio: servicio.id, doctor, fecha: dia });
      const res = await fetch(`${base}/horarios?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar los horarios");
      if (turno === cargaHoras.current) setHorarios(data.horarios);
    } catch (error) { if (turno === cargaHoras.current) { setHorarios([]); setError(error instanceof Error ? error.message : "No se pudieron cargar los horarios"); } }
  }

  function elegirServicio(s: Servicio) {
    cargaDias.current++; cargaHoras.current++;
    setServicio(s);
    setFecha(null);
    setHorarios(null);
    setHorario(null);
    const unico = s.doctores.length === 1 ? s.doctores[0].id : null;
    setDoctor(unico);
    setDias(null);
    setSiguiente(null);
    setError("");
    setEtapa(unico ? "fecha" : "especialista");
    if (unico) void cargarDias(s.id, unico);
  }

  function elegirDoctor(id: string) {
    if (!servicio) return;
    cargaHoras.current++;
    setDoctor(id);
    setFecha(null);
    setHorarios(null);
    setHorario(null);
    setDias(null);
    setSiguiente(null);
    setEtapa("fecha");
    void cargarDias(servicio.id, id);
  }

  async function confirmar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando || !servicio || !doctor || !fecha || !horario) return;
    setEnviando(true);
    setError("");
    try {
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servicioId: servicio.id, doctorId: doctor, fecha, horario, nombre, telefono, notas }),
    });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (res.ok) return setConfirmada(data);
    setError(data.error ?? "No se pudo agendar");
    if (res.status === 409) { setEtapa("hora"); void cargarHorarios(fecha, true); }
    } catch { setError("No se pudo confirmar. Revisa tu conexión antes de intentar de nuevo."); }
    finally { setEnviando(false); }
  }

  if (error && !datos) return <Marco><p role="alert" className="text-center text-sm text-muted-foreground">{error}</p><button type="button" onClick={() => setRevision((n) => n + 1)} className="min-h-11 w-full text-sm font-medium text-primary">Volver a cargar la agenda</button></Marco>;
  if (!datos) return <Marco><p className="text-center text-sm text-muted-foreground">Cargando agenda…</p></Marco>;

  if (confirmada) {
    return (
      <Marco negocio={datos.negocio}>
        <div className="space-y-3 text-center">
          <p className="text-4xl">✓</p>
          <h2 className="text-xl font-bold">¡Cita agendada!</h2>
          <p className="text-sm">
            {confirmada.servicio}
            {confirmada.especialista ? ` con ${confirmada.especialista}` : ""}
          </p>
          <p className="font-semibold first-letter:uppercase">{formato(confirmada.inicio, { dateStyle: "full", timeStyle: "short" })}</p>
          <p className="text-xs text-muted-foreground">Hora del negocio. Guarda este enlace para consultar, cambiar de horario o cancelar tu cita:</p>
          <a href={`/reservar/cita/${confirmada.token}`} className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Ver mi cita
          </a>
        </div>
      </Marco>
    );
  }

  const etapas: { id: Etapa; titulo: string }[] = [
    { id: "servicio", titulo: "Servicio" },
    ...(servicio && servicio.doctores.length > 1 ? [{ id: "especialista" as const, titulo: "Especialista" }] : []),
    { id: "fecha", titulo: "Día" }, { id: "hora", titulo: "Hora" }, { id: "datos", titulo: "Tus datos" },
  ];
  const pasoActual = etapas.findIndex((p) => p.id === etapa);
  const cambiarEtapa = (id: Etapa) => { if (!enviando) { setError(""); setEtapa(id); } };
  return (
    <Marco negocio={datos.negocio}>
      <nav aria-label="Progreso de la reserva" className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Paso {pasoActual + 1} de {etapas.length} · {etapas[pasoActual].titulo}</p>
        <div className="flex gap-1" aria-hidden="true">{etapas.map((p, i) => <span key={p.id} className={`h-1 flex-1 rounded-full ${i <= pasoActual ? "bg-primary" : "bg-muted"}`} />)}</div>
      </nav>
      {servicio && etapa !== "servicio" && <aside aria-label="Resumen de tu cita" className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="break-words font-semibold">{servicio.nombre}</h2><p className="text-sm text-muted-foreground">{servicio.duracionMin} min · {servicio.precio > 0 ? moneda(servicio.precio) : "Precio a consultar"}</p></div>
          <button type="button" disabled={enviando} onClick={() => cambiarEtapa("servicio")} className="min-h-11 shrink-0 px-2 text-sm font-medium text-primary">Cambiar servicio</button>
        </div>
        {doctor && <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-sm"><span>{doctor === SIN_PREFERENCIA ? "Sin preferencia de especialista" : servicio.doctores.find((d) => d.id === doctor)?.nombre}</span>{servicio.doctores.length > 1 && <button type="button" disabled={enviando} onClick={() => cambiarEtapa("especialista")} className="min-h-11 px-2 text-primary">Cambiar especialista</button>}</div>}
        {fecha && <div className="flex items-center justify-between gap-2 text-sm"><span className="capitalize">{textoDia(fecha)}{horario ? ` · ${formato(horario, { hour: "2-digit", minute: "2-digit" })}` : ""}</span><button type="button" disabled={enviando} onClick={() => cambiarEtapa("fecha")} className="min-h-11 px-2 text-primary">Cambiar día y hora</button></div>}
        <p className="text-xs text-muted-foreground">Hora local del negocio · {datos.zona}</p>
      </aside>}
      {error && <div className="space-y-2"><p ref={avisoError} tabIndex={-1} role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>
        {etapa === "fecha" && servicio && doctor && <button type="button" disabled={cargandoDias} onClick={() => cargarDias(servicio.id, doctor)} className="min-h-11 px-2 text-sm text-primary">Volver a buscar días</button>}
        {etapa === "hora" && fecha && <button type="button" onClick={() => cargarHorarios(fecha)} className="min-h-11 px-2 text-sm text-primary">Actualizar horarios</button>}
      </div>}
      <div ref={panel} tabIndex={-1} className="outline-none">
      {etapa === "servicio" && <Paso numero={pasoActual + 1} titulo="¿Qué servicio quieres?">
        {datos.servicios.length === 0 && <p className="text-sm text-muted-foreground">Por ahora no hay servicios para agendar.</p>}
        <div className="grid gap-2">
          {datos.servicios.map((s) => (
            <Opcion key={s.id} activa={servicio?.id === s.id} onClick={() => elegirServicio(s)}>
              <span className="font-medium">{s.nombre}</span>
              <span className="text-xs text-muted-foreground">
                {s.duracionMin} min · {s.precio > 0 ? moneda(s.precio) : "Precio a consultar"}
              </span>
              {s.descripcion && <span className="mt-1 text-sm text-muted-foreground">{s.descripcion}</span>}
            </Opcion>
          ))}
        </div>
      </Paso>}

      {etapa === "especialista" && servicio && servicio.doctores.length > 1 && (
        <Paso numero={pasoActual + 1} titulo="¿Con quién?">
          <div className="grid gap-2">
            <Opcion activa={doctor === SIN_PREFERENCIA} onClick={() => elegirDoctor(SIN_PREFERENCIA)}>
              <span className="font-medium">No tengo preferencia</span>
            </Opcion>
            {servicio.doctores.map((d) => (
              <Opcion key={d.id} activa={doctor === d.id} onClick={() => elegirDoctor(d.id)}>
                <span className="font-medium">{d.nombre}</span>
              </Opcion>
            ))}
          </div>
        </Paso>
      )}

      {etapa === "fecha" && servicio && doctor && (
        <Paso numero={pasoActual + 1} titulo="¿Qué día?">
          {dias === null && <p className="text-sm text-muted-foreground">Buscando días con lugar…</p>}
          {dias?.length === 0 && !siguiente && <p className="text-sm text-muted-foreground">No hay lugares disponibles por ahora.</p>}
          <div className="flex flex-wrap gap-2">
            {dias?.map((dia) => (
              <button key={dia} type="button" aria-pressed={fecha === dia} onClick={() => { void cargarHorarios(dia); setEtapa("hora"); }}
                className={`min-h-11 rounded-lg border px-3 py-2 text-sm capitalize ${fecha === dia ? "border-primary bg-primary text-primary-foreground" : "bg-card"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>
                {textoDia(dia)}
              </button>
            ))}
            {siguiente && (
              <button type="button" disabled={cargandoDias} onClick={() => cargarDias(servicio.id, doctor, siguiente)} className="min-h-11 px-3 py-2 text-sm font-medium text-primary">
                {cargandoDias ? "Buscando…" : "Ver más días"}
              </button>
            )}
          </div>
        </Paso>
      )}

      {etapa === "hora" && fecha && (
        <Paso numero={pasoActual + 1} titulo="¿A qué hora?">
          {horarios === null && <p className="text-sm text-muted-foreground">Cargando horarios…</p>}
          {horarios?.length === 0 && <p className="text-sm text-muted-foreground">Ese día ya no tiene lugar; elige otro.</p>}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {horarios?.map((h) => (
              <button key={h} type="button" aria-pressed={horario === h} onClick={() => { setHorario(h); setEtapa("datos"); }}
                className={`min-h-11 rounded-lg border py-2 text-sm ${horario === h ? "border-primary bg-primary text-primary-foreground" : "bg-card"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>
                {formato(h, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
              </button>
            ))}
          </div>
        </Paso>
      )}

      {etapa === "datos" && horario && (
        <Paso numero={pasoActual + 1} titulo="Tus datos">
          <form onSubmit={confirmar} className="space-y-3">
            <fieldset disabled={enviando} className="space-y-3">
            <legend className="sr-only">Datos de contacto para tu cita</legend>
            <label className="block space-y-1"><span className="text-sm font-medium">Tu nombre</span>
            <input required aria-label="Tu nombre" maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre"
              autoComplete="name" className="min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-base" /></label>
            <label className="block space-y-1"><span className="text-sm font-medium">WhatsApp (10 dígitos)</span>
            <input required aria-label="WhatsApp (10 dígitos)" maxLength={20} value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="WhatsApp (10 dígitos)"
              type="tel" inputMode="tel" autoComplete="tel" className="min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-base" /></label>
            <label className="block space-y-1"><span className="text-sm font-medium">Notas para tu visita (opcional)</span>
            <textarea aria-label="Notas opcionales" maxLength={500} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="¿Algo que debamos saber? (opcional)"
              rows={2} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-base" /></label>
            <button type="submit" disabled={enviando}
              className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {enviando ? "Agendando…" : `Confirmar · ${formato(horario, { weekday: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`}
            </button>
            <p className="text-center text-xs text-muted-foreground">Tu cita se guarda al confirmar. Conserva el enlace que aparecerá al finalizar.</p>
            </fieldset>
          </form>
        </Paso>
      )}
      </div>
      {pasoActual > 0 && <button type="button" disabled={enviando} onClick={() => cambiarEtapa(etapas[pasoActual - 1].id)} className="min-h-11 px-2 text-sm font-medium text-primary">← Volver a {etapas[pasoActual - 1].titulo.toLowerCase()}</button>}
    </Marco>
  );
}

function Marco({ negocio, children }: { negocio?: { nombre: string; logo: string | null }; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-xl space-y-5 bg-background p-4 pb-12">
      {negocio && (
        <header className="flex items-center gap-3 pt-4">
          {/* El logo es una data URL guardada en ajustes: next/image no aporta aquí. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {negocio.logo && <img src={negocio.logo} alt="" className="h-12 w-12 rounded-xl object-contain" />}
          <div className="min-w-0">
            <h1 className="break-words text-xl font-bold">{negocio.nombre}</h1>
            <p className="text-xs text-muted-foreground">Agenda tu cita en línea</p>
          </div>
        </header>
      )}
      {children}
    </main>
  );
}

function Paso({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground">{numero}</span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Opcion({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={activa} onClick={onClick}
      className={`flex min-h-16 flex-col items-start rounded-xl border p-3 text-left ${activa ? "border-primary ring-2 ring-primary/30" : "bg-card"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>
      {children}
    </button>
  );
}
