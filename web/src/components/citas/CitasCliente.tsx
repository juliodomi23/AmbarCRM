"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarioSemanal } from "@/components/citas/CalendarioSemanal";
import { DetalleCitaModal } from "@/components/citas/DetalleCitaModal";
import { DoctoresModal } from "@/components/citas/DoctoresModal";
import {
  claveFecha,
  convertirFormularioAISO,
  fechaMexicoAUTC,
  inicioDeSemana,
  sumarDias,
  valorFechaLocal,
  valorInicial,
  ZONA_CITAS,
} from "@/components/citas/fecha";
import { FormularioCitaModal } from "@/components/citas/FormularioCitaModal";
import { ESTADOS_CITA } from "@/components/citas/tipos";
import type {
  Cita,
  ContactoCita,
  DoctorCita,
  EstadoCita,
  FormularioCita,
  UsuarioCita,
  ServicioCita,
} from "@/components/citas/tipos";
import { Boton, EncabezadoPagina } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { confirmar } from "@/components/Confirmador";
import { errorFechaPasada, errorHorarioCita } from "@/lib/citas-horarios";
import { finVisible } from "@/lib/citas-duracion";

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
  zona = ZONA_CITAS,
  servicios = [],
  duracionMin = 30,
}: {
  contactos: ContactoCita[];
  usuarios: UsuarioCita[];
  doctores: DoctorCita[];
  zona?: string;
  servicios?: ServicioCita[];
  duracionMin?: number;
}) {
  const params = useSearchParams();
  const cargaActual = useRef(0);
  const [filtroDoctor, setFiltroDoctor] = useState("");
  const [filtroEspecialidad, setFiltroEspecialidad] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [editando, setEditando] = useState<Cita | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const contactoInicial = params.get("contactoId") ?? "";
  const [citas, setCitas] = useState<Cita[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [citaSeleccionada, setCitaSeleccionada] = useState<Cita | null>(null);
  const [doctores, setDoctores] = useState(doctoresIniciales);
  const [modalDoctores, setModalDoctores] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(Boolean(contactoInicial));
  const [semana, setSemana] = useState(() =>
    inicioDeSemana(claveFecha(new Date(), zona)),
  );
  const [formulario, setFormulario] = useState<FormularioCita>({
    contactoId: contactoInicial,
    conversacionId: params.get("conversacionId") ?? "",
    titulo: "Cita",
    notas: "",
    inicio: valorInicial(0, zona),
    fin: valorInicial(duracionMin, zona),
    responsableId: "",
    doctorId: "",
  });
  const hoy = claveFecha(new Date(), zona);

  const cargar = useCallback(async () => {
    const turno = ++cargaActual.current;
    setCargando(true);
    try {
      const desde = fechaMexicoAUTC(semana, "00:00", zona).toISOString();
      const hasta = fechaMexicoAUTC(sumarDias(semana, 7), "00:00", zona).toISOString();
      const todas: Cita[] = [];
      let cursor: string | null = null;
      do {
        const q: URLSearchParams = new URLSearchParams({ desde, hasta, ...(cursor ? { cursor } : {}) });
        const respuesta: Response = await fetch(`/api/citas?${q}`);
        const payload: { citas: Cita[]; siguienteCursor: string | null; error?: string } = await respuesta.json();
        if (!respuesta.ok) throw new Error(mensajeError(payload, "No se pudieron cargar las citas"));
        todas.push(...payload.citas);
        cursor = payload.siguienteCursor;
      } while (cursor);
      if (turno === cargaActual.current) setCitas(todas);
    } catch (error) {
      if (turno === cargaActual.current) toast(error instanceof Error ? error.message : "No se pudieron cargar las citas", "error");
    } finally { if (turno === cargaActual.current) setCargando(false); }
  }, [semana, zona]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    try {
    const respuesta = await fetch(editando ? `/api/citas/${editando.id}` : "/api/citas", {
      method: editando ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(editando ? {
          titulo: formulario.titulo, notas: formulario.notas,
          ...(formulario.doctorId !== (editando.doctor?.id ?? "") ? { doctorId: formulario.doctorId } : {}),
          ...((formulario.servicioId ?? "") !== (editando.servicioId ?? "") ? { servicioId: formulario.servicioId || null } : {}),
        } : formulario),
        ...(!editando || formulario.inicio !== valorFechaLocal(new Date(editando.inicio), zona) ? { inicio: convertirFormularioAISO(formulario.inicio, zona) } : {}),
        ...(!editando || formulario.fin !== valorFechaLocal(finVisible(editando), zona) ? { fin: convertirFormularioAISO(formulario.fin, zona) } : {}),
      }),
    });
    const payload = await respuesta.json().catch(() => null);
    setGuardando(false);

    if (!respuesta.ok) {
      toast(mensajeError(payload, "No se pudo crear la cita"), "error");
      return;
    }

    toast(editando ? "Cita actualizada" : "Cita creada");
    setAvisos(payload.avisos ?? []);
    setEditando(null);
    setModalAbierto(false);
    setFormulario((actual) => ({
      ...actual,
      titulo: "Cita",
      notas: "",
      inicio: valorInicial(0, zona),
      fin: valorInicial(duracionMin, zona),
      servicioId: "",
    }));
    await cargar();
    } catch { toast("No se pudo guardar la cita. Revisa tu conexión.", "error"); }
    finally { setGuardando(false); }
  }

  async function eliminar(cita: Cita) {
    setCitaSeleccionada(null);
    if (!(await confirmar({ titulo: "Eliminar cita cancelada", mensaje: `¿Eliminar «${cita.titulo}»? Esta acción no se puede deshacer. Las citas con evolución clínica no se pueden eliminar.`, confirmar: "Eliminar" }))) return;
    setGuardando(true);
    try {
      const respuesta = await fetch(`/api/citas/${cita.id}`, { method: "DELETE" });
      const payload = await respuesta.json().catch(() => null);
      if (!respuesta.ok) throw new Error(mensajeError(payload, "No se pudo eliminar la cita"));
      toast("Cita eliminada");
      await cargar();
    } catch (error) { toast(error instanceof Error ? error.message : "No se pudo eliminar la cita. Revisa tu conexión.", "error"); }
    finally { setGuardando(false); }
  }

  async function cambiarEstado(cita: Cita, estado: EstadoCita) {
    setGuardando(true);
    try {
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
    } catch { toast("No se pudo actualizar la cita. Revisa tu conexión.", "error"); }
    finally { setGuardando(false); }
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
    setDoctores((actuales) => actuales.map((actual) => actual.id === doctor.id ? { ...actual, activo: !actual.activo } : actual));
    if (payload.aviso) setAvisos([payload.aviso]);
    await cargar();
  }

  function abrirEnHorario(fecha: string, minutos: number) {
    const minutosLimitados = Math.min(
      24 * 60 - 30,
      Math.max(0, minutos),
    );
    const hora = Math.floor(minutosLimitados / 60);
    const minuto = minutosLimitados % 60;
    const textoHora = `${String(hora).padStart(2, "0")}:${String(
      minuto,
    ).padStart(2, "0")}`;
    const fin = new Date(
      fechaMexicoAUTC(fecha, textoHora, zona).getTime() + duracionMin * 60_000,
    );
    const inicio = fechaMexicoAUTC(fecha, textoHora, zona);
    const especialista = doctores.find((doctor) => doctor.id === filtroDoctor);
    const error = errorFechaPasada(inicio, zona) ?? (especialista ? errorHorarioCita({ horarios: especialista.horarios ?? [], excepciones: especialista.excepciones ?? [] }, inicio, fin, zona) : null);
    if (error) { toast(error, "error"); return; }
    setFormulario((actual) => ({
      ...actual,
      inicio: `${fecha}T${textoHora}`,
      fin: valorFechaLocal(fin, zona),
      doctorId: filtroDoctor === "sin_asignar" ? "" : filtroDoctor,
      servicioId: "",
      titulo: "Cita",
      notas: "",
    }));
    setEditando(null);
    setModalAbierto(true);
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <EncabezadoPagina
        titulo="Citas"
        descripcion={`Calendario en zona horaria ${zona}.`}
        acciones={
          <>
            <Boton variante="ghost" onClick={() => setModalDoctores(true)}>
              Doctores
            </Boton>
            <Boton onClick={() => {
              setFormulario({ contactoId: contactoInicial, conversacionId: params.get("conversacionId") ?? "", titulo: "Cita", notas: "", inicio: valorInicial(0, zona), fin: valorInicial(duracionMin, zona), responsableId: "", doctorId: filtroDoctor === "sin_asignar" ? "" : filtroDoctor, servicioId: "" });
              setEditando(null); setModalAbierto(true);
            }}>+ Nueva cita</Boton>
          </>
        }
      />

      {avisos.length > 0 && <div role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">{avisos.map((aviso) => <p key={aviso}>{aviso}</p>)}</div>}
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">Especialista
          <select aria-label="Filtrar por especialista" value={filtroDoctor} onChange={(e) => setFiltroDoctor(e.target.value)} className="ml-2 rounded-lg border border-input bg-card p-2">
            <option value="">Todos</option><option value="sin_asignar">Sin asignar</option>
            {doctores.map((d) => <option key={d.id} value={d.id}>{d.nombre}{d.activo ? "" : " (inactivo)"}</option>)}
          </select>
        </label>
        <label className="text-sm">Especialidad
          <select aria-label="Filtrar por especialidad" value={filtroEspecialidad} onChange={(e) => setFiltroEspecialidad(e.target.value)} className="ml-2 rounded-lg border border-input bg-card p-2">
            <option value="">Todas</option>{[...new Set(doctores.map((d) => d.especialidad).filter(Boolean))].map((e) => <option key={e} value={e!}>{e}</option>)}
          </select>
        </label>
        <label className="text-sm">Estado
          <select aria-label="Filtrar por estado" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="ml-2 rounded-lg border border-input bg-card p-2">
            <option value="">Todos</option>{ESTADOS_CITA.map((e) => <option key={e.valor} value={e.valor}>{e.etiqueta}</option>)}
          </select>
        </label>
      </div>
      <CalendarioSemanal
        agenda={filtroDoctor ? doctores.find((doctor) => doctor.id === filtroDoctor) : undefined}
        zona={zona}
        guardando={guardando}
        citas={citas.filter((c) => (!filtroDoctor || (filtroDoctor === "sin_asignar" ? !c.doctor : c.doctor?.id === filtroDoctor)) && (!filtroEspecialidad || c.doctor?.especialidad === filtroEspecialidad) && (!filtroEstado || c.estado === filtroEstado))}
        cargando={cargando}
        semana={semana}
        hoy={hoy}
        onCambiarSemana={setSemana}
        onNuevoHorario={abrirEnHorario}
        onCambiarEstado={(cita, estado) =>
          void cambiarEstado(cita, estado)
        }
        onSeleccionar={setCitaSeleccionada}
        onEliminar={(cita) => void eliminar(cita)}
      />

      <FormularioCitaModal
        key={editando?.id ?? (modalAbierto ? "nueva-abierta" : "cerrada")}
        servicios={servicios}
        duracionMin={duracionMin}
        zona={zona}
        citaOriginal={editando}
        abierto={modalAbierto}
        editando={Boolean(editando)}
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
        onEliminar={() => { if (citaSeleccionada) void eliminar(citaSeleccionada); }}
        zona={zona}
        onEditar={() => {
          if (!citaSeleccionada) return;
          const c = citaSeleccionada;
          setFormulario({ contactoId: c.contacto.id, conversacionId: "", responsableId: c.responsable?.id ?? "", titulo: c.titulo, notas: c.notas ?? "", inicio: valorFechaLocal(new Date(c.inicio), zona), fin: valorFechaLocal(finVisible(c), zona), doctorId: c.doctor?.id ?? "", servicioId: c.servicioId ?? "" });
          setEditando(c); setCitaSeleccionada(null); setModalAbierto(true);
        }}
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
