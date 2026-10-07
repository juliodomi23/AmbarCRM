"use client";

import { useState } from "react";
import { Boton, Campo, Modal } from "@/components/ui";
import type { DoctorCita } from "@/components/citas/tipos";

export function DoctoresModal({
  abierto,
  doctores,
  guardando,
  onClose,
  onCrear,
  onAlternar,
}: {
  abierto: boolean;
  doctores: DoctorCita[];
  guardando: boolean;
  onClose: () => void;
  onCrear: (datos: { nombre: string; especialidad: string; cedula: string; color: string }) => void;
  onAlternar: (doctor: DoctorCita) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [especialidad, setEspecialidad] = useState("");
  const [cedula, setCedula] = useState("");
  const [color, setColor] = useState("#0EA5E9");

  return (
    <Modal abierto={abierto} onClose={onClose} titulo="Doctores">
      <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
        <div className="space-y-2">
          {doctores.map((doctor) => (
            <div
              key={doctor.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: doctor.color }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{doctor.nombre}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {doctor.especialidad ?? "Sin especialidad"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={guardando}
                onClick={() => onAlternar(doctor)}
                className="text-xs font-medium text-primary hover:underline"
              >
                {doctor.activo ? "Desactivar" : "Activar"}
              </button>
            </div>
          ))}
          {doctores.length === 0 && (
            <p className="text-sm text-muted-foreground">Aún no hay doctores.</p>
          )}
        </div>

        <form
          className="space-y-3 border-t border-border pt-4"
          onSubmit={(evento) => {
            evento.preventDefault();
            onCrear({ nombre, especialidad, cedula, color });
            setNombre("");
            setEspecialidad("");
            setCedula("");
          }}
        >
          <h3 className="text-sm font-semibold">Agregar doctor</h3>
          <Campo label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          <Campo
            label="Especialidad"
            value={especialidad}
            onChange={(e) => setEspecialidad(e.target.value)}
          />
          <Campo label="Cédula" value={cedula} onChange={(e) => setCedula(e.target.value)} />
          <label className="flex items-center gap-3 text-sm text-muted-foreground">
            Color en agenda
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="ghost" onClick={onClose}>
              Cerrar
            </Boton>
            <Boton type="submit" disabled={guardando}>
              Agregar
            </Boton>
          </div>
        </form>
      </div>
    </Modal>
  );
}
