"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarioSemanal } from "@/components/citas/CalendarioSemanal";
import { DetalleCitaModal } from "@/components/citas/DetalleCitaModal";
import { DoctoresModal } from "@/components/citas/DoctoresModal";
import {
  claveFecha,
  convertirFormularioAISO,
  fechaMexicoAUTC,
  HORA_FIN,
  HORA_INICIO,
  inicioDeSemana,
  sumarDias,
  valorFechaLocal,
  valorInicial,
  ZONA_CITAS,
} from "@/components/citas/fecha";
import { FormularioCitaModal } from "@/components/citas/FormularioCitaModal";
import type {
  Cita,
  ContactoCita,
  DoctorCita,
  EstadoCita,
  FormularioCita,
  UsuarioCita,
} from "@/components/citas/tipos";
import { Boton } from "@/components/ui";
import { toast } from "@/components/Toaster";

function mensajeError(payload: unknown, respaldo: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return respaldo;
}

export function CitasCliente({
  contactos,
  usuarios,
  doctores: doctoresIniciales,
}: {
  contactos: ContactoCita[];
  usuarios: UsuarioCita[];
  doctores: DoctorCita[];
}) {
  const params = useSearchParams();
  const contactoInicial = params.get("contactoId") ?? "";
  const [citas, setCitas] = useState<Cita[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [citaSeleccionada, setCitaSeleccionada] = useState<Cita | null>(null);
  const [doctores, setDoctores] = useState(doctoresIniciales);
  const [modalDoctores, setModalDoctores] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(Boolean(contactoInicial));
  const [semana, setSemana] = useState(() =>
    inicioDeSemana(claveFecha(new Date())),
  );
  const [formulario, setFormulario] = useState<FormularioCita>({
    contactoId: contactoInicial,
    conversacionId: params.get("conversacionId") ?? "",
    titulo: "Cita",
    notas: "",
    inicio: valorInicial(),
    fin: valorInicial(60),
    responsableId: "",
    doctorId: "",
  });
  const hoy = claveFecha(new Date());

  const cargar = useCallback(async () => {
    setCargando(true);
    const desde = fechaMexicoAUTC(semana, "00:00").toISOString();
    const hasta = fechaMexicoAUTC(sumarDias(semana, 7), "00:00").toISOString();
    const respuesta = await fetch(
      `/api/citas?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
    );
    const payload = await respuesta.json().catch(() => null);
    setCargando(false);

    if (!respuesta.ok) {
      toast(mensajeError(payload, "No se pudieron cargar las citas"), "error");
      return;
    }

    setCitas(
      payload && typeof payload === "object" && "citas" in payload
        ? (payload.citas as Cita[])
        : [],
    );
  }, [semana]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    const respuesta = await fetch("/api/citas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...formulario,
        inicio: convertirFormularioAISO(formulario.inicio),
        fin: convertirFormularioAISO(formulario.fin),
      }),
    });
    const payload = await respuesta.json().catch(() => null);
    setGuardando(false);

    if (!respuesta.ok) {
      toast(mensajeError(payload, "No se pudo crear la cita"), "error");
      return;
    }

    toast("Cita creada");
    setModalAbierto(false);
    setFormulario((actual) => ({
      ...actual,
      titulo: "Cita",
      notas: "",
      inicio: valorInicial(),
      fin: valorInicial(60),
    }));
    await cargar();
  }

  async function cambiarEstado(cita: Cita, estado: EstadoCita) {
    setGuardando(true);
    const respuesta = await fetch(`/api/citas/${cita.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    const payload = await respuesta.json().catch(() => null);
    setGuardando(false);
    if (!respuesta.ok) {
      toast(mensajeError(payload, "No se pudo actualizar la cita"), "error");
      return;
    }
    setCitas((actuales) =>
      actuales.map((actual) =>
        actual.id === cita.id ? { ...actual, estado } : actual,
      ),
    );
    setCitaSeleccionada((actual) =>
      actual?.id === cita.id ? { ...actual, estado } : actual,
    );
    toast("Estado de la cita actualizado");
  }

  async function crearDoctor(datos: {
    nombre: string;
    especialidad: string;
    cedula: string;
    color: string;
  }) {
    setGuardando(true);
    const respuesta = await fetch("/api/doctores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const payload = await respuesta.json().catch(() => null);
    setGuardando(false);
    if (!respuesta.ok) {
      toast(mensajeError(payload, "No se pudo agregar el doctor"), "error");
      return;
    }
    setDoctores((actuales) => [...actuales, payload.doctor]);
    toast("Doctor agregado");
  }

  async function alternarDoctor(doctor: DoctorCita) {
    setGuardando(true);
    const respuesta = await fetch(`/api/doctores/${doctor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !doctor.activo }),
    });
    const payload = await respuesta.json().catch(() => null);
    setGuardando(false);
    if (!respuesta.ok) {
      toast(mensajeError(payload, "No se pudo actualizar el doctor"), "error");
      return;
    }
    setDoctores((actuales) =>
      actuales.map((actual) =>
        actual.id === doctor.id ? { ...actual, activo: !actual.activo } : actual,
      ),
    );
  }

  function abrirEnHorario(fecha: string, minutos: number) {
    const minutosLimitados = Math.min(
      HORA_FIN * 60 - 60,
      Math.max(HORA_INICIO * 60, minutos),
    );
    const hora = Math.floor(minutosLimitados / 60);
    const minuto = minutosLimitados % 60;
    const textoHora = `${String(hora).padStart(2, "0")}:${String(
      minuto,
    ).padStart(2, "0")}`;
    const fin = new Date(
      fechaMexicoAUTC(fecha, textoHora).getTime() + 60 * 60_000,
    );
    setFormulario((actual) => ({
      ...actual,
      inicio: `${fecha}T${textoHora}`,
      fin: valorFechaLocal(fin),
    }));
    setModalAbierto(true);
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Citas</h1>
          <p className="text-sm text-muted-foreground">
            Calendario en zona horaria {ZONA_CITAS}.
          </p>
        </div>
        <div className="flex gap-2">
          <Boton variante="ghost" onClick={() => setModalDoctores(true)}>
            Doctores
          </Boton>
          <Boton onClick={() => setModalAbierto(true)}>+ Nueva cita</Boton>
        </div>
      </div>

      <CalendarioSemanal
        citas={citas}
        cargando={cargando}
        semana={semana}
        hoy={hoy}
        onCambiarSemana={setSemana}
        onNuevoHorario={abrirEnHorario}
        onCambiarEstado={(cita, estado) =>
          void cambiarEstado(cita, estado)
        }
        onSeleccionar={setCitaSeleccionada}
      />

      <FormularioCitaModal
        abierto={modalAbierto}
        guardando={guardando}
        formulario={formulario}
        contactos={contactos}
        usuarios={usuarios}
        doctores={doctores}
        onChange={setFormulario}
        onClose={() => setModalAbierto(false)}
        onSubmit={(evento) => void crear(evento)}
      />
      <DetalleCitaModal
        cita={citaSeleccionada}
        guardando={guardando}
        onClose={() => setCitaSeleccionada(null)}
        onCambiarEstado={(estado) => {
          if (citaSeleccionada) void cambiarEstado(citaSeleccionada, estado);
        }}
      />
      <DoctoresModal
        abierto={modalDoctores}
        doctores={doctores}
        guardando={guardando}
        onClose={() => setModalDoctores(false)}
        onCrear={(datos) => void crearDoctor(datos)}
        onAlternar={(doctor) => void alternarDoctor(doctor)}
      />
    </div>
  );
}
