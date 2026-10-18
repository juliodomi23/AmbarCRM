"use client";
import { useFocoModal } from "./useFocoModal";
import { useState } from "react";
import Link from "next/link";
import { convertirFormularioAISO, valorFechaLocal, ZONA_CITAS } from "./fecha";
import { finDeCita, finVisible } from "@/lib/citas-duracion";
import { errorFechaPasada, errorHorarioCita } from "@/lib/citas-horarios";
import { errorIntervaloCita } from "@/lib/citas-reglas";

import { Boton, Campo, Modal } from "@/components/ui";
import type {
  ContactoCita,
  DoctorCita,
  FormularioCita,
  UsuarioCita,
  ServicioCita,
  Cita,
} from "@/components/citas/tipos";

export function FormularioCitaModal({
  abierto,
  editando = false,
  guardando,
  formulario,
  contactos,
  usuarios,
  doctores,
  servicios = [],
  duracionMin = 30,
  zona = ZONA_CITAS,
  citaOriginal,
  onChange,
  onClose,
  onSubmit,
}: {
  abierto: boolean;
  editando?: boolean;
  guardando: boolean;
  formulario: FormularioCita;
  contactos: ContactoCita[];
  usuarios: UsuarioCita[];
  doctores: DoctorCita[];
  servicios?: ServicioCita[];
  duracionMin?: number;
  zona?: string;
  citaOriginal?: Cita | null;
  onChange: (formulario: FormularioCita) => void;
  onClose: () => void;
  onSubmit: (evento: React.FormEvent) => void;
}) {
  useFocoModal(abierto);
  const servicio = servicios.find((item) => item.id === formulario.servicioId);
  const [duracionElegida, setDuracionElegida] = useState(() => {
    if (editando) return (+new Date(convertirFormularioAISO(formulario.fin, zona)) - +new Date(convertirFormularioAISO(formulario.inicio, zona))) / 60_000;
    return servicio?.duracionMin ?? duracionMin;
  });
  const especialista = doctores.find((item) => item.id === formulario.doctorId);
  let motivo: string | null = null;
  try {
    const inicio = new Date(convertirFormularioAISO(formulario.inicio, zona));
    const fin = new Date(convertirFormularioAISO(formulario.fin, zona));
    const movida = !citaOriginal || +inicio !== +new Date(citaOriginal.inicio) || +fin !== +finVisible(citaOriginal) || formulario.doctorId !== (citaOriginal.doctor?.id ?? "") || (formulario.servicioId ?? "") !== (citaOriginal.servicioId ?? "");
    motivo = errorIntervaloCita(inicio, fin);
    if (!motivo && movida) motivo = errorFechaPasada(inicio, zona) ?? (especialista ? errorHorarioCita({ horarios: especialista.horarios ?? [], excepciones: especialista.excepciones ?? [] }, inicio, finDeCita(fin, servicio?.bufferMin ?? 0), zona) : null);
    if (!motivo && movida && servicio && +fin !== +finDeCita(inicio, servicio.duracionMin)) motivo = `El fin debe coincidir con los ${servicio.duracionMin} minutos del servicio`;
  } catch { motivo = "Completa una fecha y hora válidas en la zona del negocio"; }

  function cambiarInicio(inicio: string) {
    let fin = formulario.fin;
    try { fin = valorFechaLocal(finDeCita(new Date(convertirFormularioAISO(inicio, zona)), servicio?.duracionMin ?? duracionElegida), zona); } catch { fin = formulario.fin; }
    onChange({ ...formulario, inicio, fin });
  }

  function cambiarServicio(servicioId: string) {
    const elegido = servicios.find((item) => item.id === servicioId);
    const duracion = elegido?.duracionMin ?? duracionMin;
    setDuracionElegida(duracion);
    let fin = formulario.fin;
    try { fin = valorFechaLocal(finDeCita(new Date(convertirFormularioAISO(formulario.inicio, zona)), duracion), zona); } catch { fin = formulario.fin; }
    onChange({ ...formulario, servicioId, fin, titulo: elegido?.nombre ?? formulario.titulo, doctorId: elegido && !elegido.doctores.some((item) => item.doctorId === formulario.doctorId) ? "" : formulario.doctorId });
  }
  return (
    <Modal abierto={abierto} onClose={onClose} titulo={editando ? "Editar cita" : "Nueva cita"}>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">Servicio (opcional)</span>
          <select value={formulario.servicioId ?? ""} onChange={(evento) => cambiarServicio(evento.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm">
            <option value="">Sin servicio · título libre</option>
            {formulario.servicioId && !servicio && <option value={formulario.servicioId} disabled>Servicio inactivo · conservado en el historial</option>}
            {servicios.map((item) => <option key={item.id} value={item.id}>{item.nombre} · {item.duracionMin} min</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            Especialista
          </span>
          <select
            value={formulario.doctorId}
            onChange={(evento) =>
              onChange({ ...formulario, doctorId: evento.target.value })
            }
            className="w-full rounded-lg border border-input px-3 py-2 text-sm"
          >
            <option value="">Sin asignar</option>
            {especialista && !especialista.activo && <option value={especialista.id} disabled>{especialista.nombre} · inactivo (historial)</option>}
            {doctores
              .filter((doctor) => doctor.activo && (!servicio || servicio.doctores.some((item) => item.doctorId === doctor.id)))
              .map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.nombre}
                  {doctor.especialidad ? ` · ${doctor.especialidad}` : ""}
                </option>
              ))}
          </select>
        </label>
        {especialista && !especialista.activo && <p role="status" className="text-sm text-warning">Especialista inactivo; se conserva en el historial. Selecciona uno activo para reasignar.</p>}
        {especialista?.activo && !especialista.horarios?.length && <p role="status" className="text-sm text-warning">Sin horarios definidos: se permite agendar. <Link href="/reservas-en-linea" className="underline">Definir horario en Reservas en línea</Link>.</p>}
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            Contacto
          </span>
          <select
            required
            disabled={editando}
            value={formulario.contactoId}
            onChange={(evento) =>
              onChange({ ...formulario, contactoId: evento.target.value })
            }
            className="w-full rounded-lg border border-input px-3 py-2 text-sm"
          >
            <option value="">Selecciona un contacto…</option>
            {contactos.map((contacto) => (
              <option key={contacto.id} value={contacto.id}>
                {contacto.nombre}
              </option>
            ))}
          </select>
        </label>
        <Campo
          label="Título"
          value={formulario.titulo}
          onChange={(evento) =>
            onChange({ ...formulario, titulo: evento.target.value })
          }
          required
          maxLength={200}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo
            label="Inicio"
            type="datetime-local"
            step={300}
            value={formulario.inicio}
            onChange={(evento) =>
              cambiarInicio(evento.target.value)
            }
            required
          />
          <Campo
            label="Fin"
            type="datetime-local"
            step={300}
            value={formulario.fin}
            onChange={(evento) => {
              const fin = evento.target.value;
              try {
                const duracion = (+new Date(convertirFormularioAISO(fin, zona)) - +new Date(convertirFormularioAISO(formulario.inicio, zona))) / 60_000;
                if (duracion > 0) setDuracionElegida(duracion);
              } catch { setDuracionElegida(servicio?.duracionMin ?? duracionMin); }
              onChange({ ...formulario, fin });
            }}
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">Duración: {servicio?.duracionMin ?? duracionElegida} min. El fin es editable.{servicio?.bufferMin ? ` Margen interno adicional: ${servicio.bufferMin} min, sin incluirlo en el fin visible.` : ""}</p>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            Responsable
          </span>
          <select
            disabled={editando}
            value={formulario.responsableId}
            onChange={(evento) =>
              onChange({ ...formulario, responsableId: evento.target.value })
            }
            className="w-full rounded-lg border border-input px-3 py-2 text-sm"
          >
            <option value="">Usuario actual</option>
            {usuarios.map((usuario) => (
              <option key={usuario.id} value={usuario.id}>
                {usuario.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            Notas
          </span>
          <textarea
            rows={3}
            maxLength={5000}
            value={formulario.notas}
            onChange={(evento) =>
              onChange({ ...formulario, notas: evento.target.value })
            }
            className={[
              "w-full rounded-lg border border-input px-3 py-2 text-sm",
              "outline-none focus:ring-2 focus:ring-primary/30",
            ].join(" ")}
            placeholder="Información útil para la cita…"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Boton type="button" variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={guardando || Boolean(motivo)} aria-describedby={motivo ? "cita-motivo" : undefined}>
            {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear cita"}
          </Boton>
        </div>
        {motivo && <p id="cita-motivo" role="alert" className="text-sm text-destructive">{motivo}</p>}
      </form>
    </Modal>
  );
}
