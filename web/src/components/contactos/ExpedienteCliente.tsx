"use client";

import Link from "next/link";
import { useState } from "react";
import { Boton, Campo } from "@/components/ui";
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
}: {
  contacto: {
    id: string;
    nombre: string;
    telefono: string | null;
    email: string | null;
    expediente: Expediente | null;
  };
  doctores: DoctorCita[];
  citas: CitaExpediente[];
}) {
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

  function set(campo: keyof typeof formulario, valor: string) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    const respuesta = await fetch(`/api/contactos/${contacto.id}/expediente`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formulario),
    });
    const payload = await respuesta.json().catch(() => null);
    setGuardando(false);
    if (!respuesta.ok) {
      toast(errorApi(payload, "No se pudo guardar el expediente"), "error");
      return;
    }
    toast("Expediente guardado");
  }

  async function agregarEvolucion(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    const respuesta = await fetch(`/api/contactos/${contacto.id}/expediente`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contenido: nota, doctorId, citaId }),
    });
    const payload = await respuesta.json().catch(() => null);
    setGuardando(false);
    if (!respuesta.ok) {
      toast(errorApi(payload, "No se pudo registrar la evolución"), "error");
      return;
    }
    setEvoluciones((actuales) => [payload.evolucion, ...actuales]);
    setNota("");
    toast("Evolución registrada");
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/contactos" className="text-sm text-primary hover:underline">
            ← Contactos
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Expediente de {contacto.nombre}</h1>
          <p className="text-sm text-muted-foreground">
            {contacto.telefono ? `+${contacto.telefono}` : "Sin teléfono"}
            {contacto.email ? ` · ${contacto.email}` : ""}
          </p>
        </div>
        <Link
          href={`/citas?contactoId=${contacto.id}`}
          className="rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground"
        >
          Nueva cita
        </Link>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <form
          onSubmit={guardar}
          className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-soft"
        >
          <h2 className="font-semibold">Datos clínicos</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              label="Fecha de nacimiento"
              type="date"
              value={formulario.fechaNacimiento}
              onChange={(e) => set("fechaNacimiento", e.target.value)}
            />
            <Campo label="Sexo" value={formulario.sexo} onChange={(e) => set("sexo", e.target.value)} />
          </div>
          <AreaTexto label="Alergias" value={formulario.alergias} onChange={(v) => set("alergias", v)} />
          <AreaTexto
            label="Antecedentes y enfermedades crónicas"
            value={formulario.antecedentes}
            onChange={(v) => set("antecedentes", v)}
          />
          <AreaTexto
            label="Medicamentos actuales"
            value={formulario.medicamentos}
            onChange={(v) => set("medicamentos", v)}
          />
          <AreaTexto
            label="Observaciones"
            value={formulario.observaciones}
            onChange={(v) => set("observaciones", v)}
          />
          <div className="flex justify-end">
            <Boton type="submit" disabled={guardando}>
              Guardar expediente
            </Boton>
          </div>
        </form>

        <section className="space-y-4">
          <form
            onSubmit={agregarEvolucion}
            className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-soft"
          >
            <h2 className="font-semibold">Nueva evolución</h2>
            <AreaTexto label="Nota clínica" value={nota} onChange={setNota} required />
            <div className="grid gap-3 sm:grid-cols-2">
              <Selector
                label="Doctor"
                value={doctorId}
                onChange={setDoctorId}
                opciones={doctores.map((doctor) => ({
                  valor: doctor.id,
                  etiqueta: doctor.nombre,
                }))}
              />
              <Selector
                label="Cita relacionada"
                value={citaId}
                onChange={setCitaId}
                opciones={citas.map((cita) => ({
                  valor: cita.id,
                  etiqueta: cita.titulo,
                }))}
              />
            </div>
            <Boton type="submit" disabled={guardando}>
              Registrar evolución
            </Boton>
          </form>

          <div className="space-y-2">
            <h2 className="font-semibold">Historial clínico</h2>
            {evoluciones.map((evolucion) => (
              <article key={evolucion.id} className="rounded-xl border border-border bg-card p-4">
                <p className="whitespace-pre-wrap text-sm">{evolucion.contenido}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("es-MX", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: ZONA_CITAS,
                  }).format(new Date(evolucion.createdAt))}
                  {evolucion.doctor ? ` · ${evolucion.doctor.nombre}` : ""}
                  {evolucion.cita ? ` · ${evolucion.cita.titulo}` : ""}
                </p>
              </article>
            ))}
            {evoluciones.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                Aún no hay evoluciones clínicas.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function AreaTexto({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <textarea
        rows={3}
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
}: {
  label: string;
  value: string;
  opciones: { valor: string; etiqueta: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <select
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
