"use client";

import Link from "next/link";
import { Boton, Modal } from "@/components/ui";
import { ZONA_CITAS } from "@/components/citas/fecha";
import type { Cita, EstadoCita } from "@/components/citas/tipos";

const ACCIONES: { estado: EstadoCita; etiqueta: string; clase: string }[] = [
  { estado: "confirmada", etiqueta: "Confirmó", clase: "bg-emerald-600" },
  { estado: "en_sala", etiqueta: "Ya llegó", clase: "bg-violet-600" },
  { estado: "completada", etiqueta: "Atendido", clase: "bg-slate-700" },
  { estado: "no_asistio", etiqueta: "No llegó", clase: "bg-amber-600" },
];

export function DetalleCitaModal({
  cita,
  guardando,
  onClose,
  onCambiarEstado,
}: {
  cita: Cita | null;
  guardando: boolean;
  onClose: () => void;
  onCambiarEstado: (estado: EstadoCita) => void;
}) {
  if (!cita) return null;
  const horario = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA_CITAS,
  }).format(new Date(cita.inicio));

  return (
    <Modal abierto onClose={onClose} titulo={cita.titulo}>
      <div className="space-y-4">
        <div className="rounded-xl bg-muted p-3 text-sm">
          <p className="font-semibold text-foreground">{cita.contacto.nombre}</p>
          <p className="capitalize text-muted-foreground">{horario}</p>
          <p className="text-muted-foreground">
            {cita.doctor
              ? `${cita.doctor.nombre}${
                  cita.doctor.especialidad ? ` · ${cita.doctor.especialidad}` : ""
                }`
              : "Sin doctor asignado"}
          </p>
          {cita.notas && <p className="mt-2 whitespace-pre-wrap">{cita.notas}</p>}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Acciones rápidas
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ACCIONES.map((accion) => (
              <button
                key={accion.estado}
                type="button"
                disabled={guardando}
                onClick={() => onCambiarEstado(accion.estado)}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-medium text-white",
                  "disabled:opacity-60",
                  accion.clase,
                  cita.estado === accion.estado ? "ring-2 ring-offset-2" : "",
                ].join(" ")}
              >
                {accion.etiqueta}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={guardando}
            onClick={() => onCambiarEstado("cancelada")}
            className="mt-2 w-full rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700"
          >
            Cancelar cita
          </button>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          <Boton type="button" variante="ghost" onClick={onClose}>
            Cerrar
          </Boton>
          <Link
            href={`/contactos/${cita.contacto.id}/expediente`}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground"
          >
            Ver expediente
          </Link>
        </div>
      </div>
    </Modal>
  );
}
