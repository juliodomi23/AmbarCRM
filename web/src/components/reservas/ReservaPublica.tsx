"use client";

import { useCallback, useEffect, useState } from "react";

type Doctor = { id: string; nombre: string };
type Servicio = { id: string; nombre: string; descripcion: string | null; duracionMin: number; precio: number; doctores: Doctor[] };
type Datos = { negocio: { nombre: string; logo: string | null }; zona: string; servicios: Servicio[] };
type Confirmada = { token: string; inicio: string; especialista: string | null; servicio: string };

const SIN_PREFERENCIA = "cualquiera";
const moneda = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

/** Asistente público de reservas: servicio → especialista → día → hora → datos. */
export function ReservaPublica({ slug }: { slug: string }) {
  const base = `/api/public/reservas/${encodeURIComponent(slug)}`;
  const [datos, setDatos] = useState<Datos | null>(null);
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

  useEffect(() => {
    void fetch(base).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDatos(data);
      else setError(data.error ?? "No se pudo cargar la agenda");
    });
  }, [base]);

  const formato = useCallback(
    (iso: string, opciones: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("es-MX", { timeZone: datos?.zona, ...opciones }).format(new Date(iso)),
    [datos?.zona],
  );
  const textoDia = (dia: string) =>
    new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${dia}T12:00:00Z`));

  async function cargarDias(servicioId: string, doctorId: string, desde?: string) {
    const q = new URLSearchParams({ servicio: servicioId, doctor: doctorId, ...(desde ? { desde } : {}) });
    const res = await fetch(`${base}/horarios?${q}`);
    const data = await res.json().catch(() => ({}));
    setDias((previos) => (desde ? [...(previos ?? []), ...(data.dias ?? [])] : (data.dias ?? [])));
    setSiguiente(data.siguiente ?? null);
  }

  async function cargarHorarios(dia: string) {
    if (!servicio || !doctor) return;
    setFecha(dia);
    setHorario(null);
    setHorarios(null);
    const q = new URLSearchParams({ servicio: servicio.id, doctor, fecha: dia });
    const data = await (await fetch(`${base}/horarios?${q}`)).json().catch(() => ({}));
    setHorarios(data.horarios ?? []);
  }

  function elegirServicio(s: Servicio) {
    setServicio(s);
    setFecha(null);
    setHorarios(null);
    setHorario(null);
    const unico = s.doctores.length === 1 ? s.doctores[0].id : null;
    setDoctor(unico);
    setDias(null);
    if (unico) void cargarDias(s.id, unico);
  }

  function elegirDoctor(id: string) {
    if (!servicio) return;
    setDoctor(id);
    setFecha(null);
    setHorarios(null);
    setHorario(null);
    setDias(null);
    void cargarDias(servicio.id, id);
  }

  async function confirmar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!servicio || !doctor || !fecha || !horario) return;
    setEnviando(true);
    setError("");
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servicioId: servicio.id, doctorId: doctor, fecha, horario, nombre, telefono, notas }),
    });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (res.ok) return setConfirmada(data);
    setError(data.error ?? "No se pudo agendar");
    if (res.status === 409) void cargarHorarios(fecha);
  }

  if (error && !datos) return <Marco><p className="text-center text-sm text-muted-foreground">{error}</p></Marco>;
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
          <p className="text-xs text-muted-foreground">Hora del negocio. Guarda este enlace para consultar o cancelar tu cita:</p>
          <a href={`/reservar/cita/${confirmada.token}`} className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Ver mi cita
          </a>
        </div>
      </Marco>
    );
  }

  return (
    <Marco negocio={datos.negocio}>
      <Paso numero={1} titulo="¿Qué servicio quieres?">
        {datos.servicios.length === 0 && <p className="text-sm text-muted-foreground">Por ahora no hay servicios para agendar.</p>}
        <div className="grid gap-2">
          {datos.servicios.map((s) => (
            <Opcion key={s.id} activa={servicio?.id === s.id} onClick={() => elegirServicio(s)}>
              <span className="font-medium">{s.nombre}</span>
              <span className="text-xs text-muted-foreground">
                {s.duracionMin} min{s.precio > 0 ? ` · ${moneda(s.precio)}` : ""}
              </span>
            </Opcion>
          ))}
        </div>
      </Paso>

      {servicio && servicio.doctores.length > 1 && (
        <Paso numero={2} titulo="¿Con quién?">
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

      {servicio && doctor && (
        <Paso numero={3} titulo="¿Qué día?">
          {dias === null && <p className="text-sm text-muted-foreground">Buscando días con lugar…</p>}
          {dias?.length === 0 && !siguiente && <p className="text-sm text-muted-foreground">No hay lugares disponibles por ahora.</p>}
          <div className="flex flex-wrap gap-2">
            {dias?.map((dia) => (
              <button key={dia} type="button" onClick={() => cargarHorarios(dia)}
                className={`rounded-lg border px-3 py-2 text-sm capitalize ${fecha === dia ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>
                {textoDia(dia)}
              </button>
            ))}
            {siguiente && (
              <button type="button" onClick={() => cargarDias(servicio.id, doctor, siguiente)} className="px-3 py-2 text-sm font-medium text-primary">
                Ver más días
              </button>
            )}
          </div>
        </Paso>
      )}

      {fecha && (
        <Paso numero={4} titulo="¿A qué hora?">
          {horarios === null && <p className="text-sm text-muted-foreground">Cargando horarios…</p>}
          {horarios?.length === 0 && <p className="text-sm text-muted-foreground">Ese día ya no tiene lugar; elige otro.</p>}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {horarios?.map((h) => (
              <button key={h} type="button" onClick={() => setHorario(h)}
                className={`rounded-lg border py-2 text-sm ${horario === h ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>
                {formato(h, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
              </button>
            ))}
          </div>
        </Paso>
      )}

      {horario && (
        <Paso numero={5} titulo="Tus datos">
          <form onSubmit={confirmar} className="space-y-3">
            <input required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre"
              autoComplete="name" className="w-full rounded-lg border bg-card px-3 py-2 text-sm" />
            <input required value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="WhatsApp (10 dígitos)"
              inputMode="tel" autoComplete="tel" className="w-full rounded-lg border bg-card px-3 py-2 text-sm" />
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="¿Algo que debamos saber? (opcional)"
              rows={2} className="w-full rounded-lg border bg-card px-3 py-2 text-sm" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={enviando}
              className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {enviando ? "Agendando…" : `Confirmar · ${formato(horario, { weekday: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`}
            </button>
            <p className="text-center text-xs text-muted-foreground">Horarios en la hora local del negocio.</p>
          </form>
        </Paso>
      )}
    </Marco>
  );
}

function Marco({ negocio, children }: { negocio?: { nombre: string; logo: string | null }; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-5 bg-background p-4 pb-12">
      {negocio && (
        <header className="flex items-center gap-3 pt-4">
          {/* El logo es una data URL guardada en ajustes: next/image no aporta aquí. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {negocio.logo && <img src={negocio.logo} alt="" className="h-12 w-12 rounded-xl object-contain" />}
          <div>
            <h1 className="text-xl font-bold">{negocio.nombre}</h1>
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
    <button type="button" onClick={onClick}
      className={`flex flex-col items-start rounded-xl border p-3 text-left ${activa ? "border-primary ring-2 ring-primary/30" : "bg-card"}`}>
      {children}
    </button>
  );
}
