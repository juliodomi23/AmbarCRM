"use client";

import Link from "next/link";
import { useState } from "react";
import { DatosPersonalesFicha } from "@/components/clientes/DatosPersonalesFicha";
import { Boton } from "@/components/ui";
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
  doctor: DoctorCita | null;
};

function valorFecha(fecha: string | null | undefined) {
  return fecha ? fecha.slice(0, 10) : "";
}

function errorApi(payload: unknown, respaldo: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    return String(payload.error);
  }
  return respaldo;
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
    } catch { toast("No se pudo guardar. Revisa tu conexión e intenta de nuevo.", "error"); }
    finally { setGuardando(false); }
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
    setNota(""); setCitaId(""); setDoctorId("");
    toast(esClinica ? "Evolución registrada" : "Atención registrada");
    } catch { toast("No se pudo registrar. Revisa tu conexión e intenta de nuevo.", "error"); }
    finally { setRegistrando(false); }
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/${modo}`} className="text-sm text-primary hover:underline">
            ← {esClinica ? "Pacientes" : "Clientes"}
          </Link>
          <h1 className="mt-1 break-words text-2xl font-bold">
            {esClinica ? "Expediente" : "Ficha de servicio"} de {contacto.nombre}
          </h1>
          <p className="text-sm text-muted-foreground">
            {contacto.telefono ? `+${contacto.telefono}` : "Sin teléfono"}
            {contacto.email ? ` · ${contacto.email}` : ""}
          </p>
        </div>
        {citasActivo && (
          <Link
            href={`/citas?contactoId=${contacto.id}`}
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground"
          >
            Nueva cita
          </Link>
        )}
      </header>

      {soloBasico && (
        <div className="surface p-5 text-sm text-muted-foreground">
          Puedes consultar los datos básicos y gestionar sus citas. El expediente y
          las evoluciones clínicas están disponibles únicamente para puestos autorizados.
        </div>
      )}

      {!soloBasico && formulario.alergias.trim() && !["no", "ninguna", "ninguno"].includes(formulario.alergias.trim().toLowerCase()) && <aside className="rounded-xl border border-warning/30 bg-warning/10 p-4">
        <h2 className="text-sm font-semibold">{esClinica ? "Alergias a tener en cuenta" : "Antes de comenzar el servicio"}</h2>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{formulario.alergias}</p>
      </aside>}
      {!soloBasico && (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <form
          onSubmit={guardar}
          className="space-y-4 surface p-5"
        >
          <h2 className="font-semibold">
            {esClinica ? "Datos clínicos" : "Preferencias y cuidados"}
          </h2>
          <AreaTexto
            label={esClinica ? "Alergias" : "Alergias o sensibilidades"}
            value={formulario.alergias}
            onChange={(v) => set("alergias", v)}
          />
          <AreaTexto
            label={esClinica ? "Antecedentes clínicos" : "Preferencias de servicio"}
            placeholder={esClinica ? undefined : "Forma y tonos de uñas, largo o estilo de pestañas, presión del masaje…"}
            value={formulario.antecedentes}
            onChange={(v) => set("antecedentes", v)}
          />
          <AreaTexto
            label={esClinica ? "Medicamentos actuales" : "Productos o tratamientos a evitar"}
            placeholder={esClinica ? undefined : "Productos que le han causado molestias o que prefiere evitar"}
            value={formulario.medicamentos}
            onChange={(v) => set("medicamentos", v)}
          />
          <AreaTexto
            label="Observaciones"
            value={formulario.observaciones}
            onChange={(v) => set("observaciones", v)}
          />
          <DatosPersonalesFicha clinica={esClinica} fechaNacimiento={formulario.fechaNacimiento} sexo={formulario.sexo} onChange={set} />
          <div className="flex justify-end">
            <Boton type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : `Guardar ${esClinica ? "expediente" : "ficha"}`}
            </Boton>
          </div>
        </form>

        <section className="space-y-4">
          <form
            onSubmit={agregarEvolucion}
            className="space-y-3 surface p-5"
          >
            <h2 className="font-semibold">
              {esClinica ? "Nueva evolución" : "Registrar atención"}
            </h2>
            <AreaTexto
              label={esClinica ? "Nota clínica" : "¿Qué se realizó en esta visita?"}
              placeholder={esClinica ? undefined : "Ej. retoque de pestañas, técnica y productos utilizados, tono de gel y cuidados indicados"}
              value={nota}
              onChange={setNota}
              required
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Selector
                label={esClinica ? "Doctor" : "Especialista"}
                value={doctorId}
                onChange={setDoctorId}
                disabled={Boolean(citaId)}
                opciones={doctores.map((doctor) => ({
                  valor: doctor.id,
                  etiqueta: doctor.nombre,
                }))}
              />
              {citasActivo && (
                <Selector
                  label="Cita relacionada"
                  value={citaId}
                  onChange={(id) => { setCitaId(id); setDoctorId(citas.find((c) => c.id === id)?.doctor?.id ?? ""); }}
                  opciones={citas.map((cita) => ({
                    valor: cita.id,
                    etiqueta: `${new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: zona }).format(new Date(cita.inicio))} · ${cita.titulo}`,
                  }))}
                />
              )}
            </div>
            <Boton type="submit" disabled={registrando || !nota.trim()}>
              {registrando ? "Registrando…" : `Registrar ${esClinica ? "evolución" : "atención"}`}
            </Boton>
          </form>

          <div className="space-y-2">
            <h2 className="font-semibold">
              {esClinica ? "Historial clínico" : "Historial de servicios"}
            </h2>
            {evoluciones.map((evolucion) => (
              <article key={evolucion.id} className="surface p-4">
                <p className="whitespace-pre-wrap text-sm">{evolucion.contenido}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("es-MX", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: zona,
                  }).format(new Date(evolucion.createdAt))}
                  {evolucion.doctor ? ` · ${evolucion.doctor.nombre}` : ""}
                  {evolucion.cita ? ` · ${evolucion.cita.titulo}` : ""}
                </p>
              </article>
            ))}
            {evoluciones.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                Aún no hay {esClinica ? "evoluciones clínicas" : "servicios registrados"}.
              </p>
            )}
          </div>
        </section>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <textarea
        rows={3}
        maxLength={10000}
        placeholder={placeholder}
        value={value}
        required={required}
        onChange={(evento) => onChange(evento.target.value)}
        className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2"
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
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <select
        disabled={disabled}
        value={value}
        onChange={(evento) => onChange(evento.target.value)}
        className="w-full rounded-lg border border-input px-3 py-2 text-sm"
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
