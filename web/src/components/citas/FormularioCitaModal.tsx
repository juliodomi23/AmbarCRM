"use client";
import { useFocoModal } from "./useFocoModal";

import { Boton, Campo, Modal } from "@/components/ui";
import type {
  ContactoCita,
  DoctorCita,
  FormularioCita,
  UsuarioCita,
} from "@/components/citas/tipos";

export function FormularioCitaModal({
  abierto,
  editando = false,
  guardando,
  formulario,
  contactos,
  usuarios,
  doctores,
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
  onChange: (formulario: FormularioCita) => void;
  onClose: () => void;
  onSubmit: (evento: React.FormEvent) => void;
}) {
  useFocoModal(abierto);
  return (
    <Modal abierto={abierto} onClose={onClose} titulo={editando ? "Editar cita" : "Nueva cita"}>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            Doctor
          </span>
          <select
            value={formulario.doctorId}
            onChange={(evento) =>
              onChange({ ...formulario, doctorId: evento.target.value })
            }
            className="w-full rounded-lg border border-input px-3 py-2 text-sm"
          >
            <option value="">Sin asignar</option>
            {doctores
              .filter((doctor) => doctor.activo || doctor.id === formulario.doctorId)
              .map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.nombre}
                  {doctor.especialidad ? ` · ${doctor.especialidad}` : ""}
                </option>
              ))}
          </select>
        </label>
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
            value={formulario.inicio}
            onChange={(evento) =>
              onChange({ ...formulario, inicio: evento.target.value })
            }
            required
          />
          <Campo
            label="Fin"
            type="datetime-local"
            value={formulario.fin}
            onChange={(evento) =>
              onChange({ ...formulario, fin: evento.target.value })
            }
            required
          />
        </div>
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
          <Boton type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear cita"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
