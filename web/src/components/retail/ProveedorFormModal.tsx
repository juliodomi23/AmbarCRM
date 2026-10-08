"use client";

import { useEffect, useState } from "react";
import { Boton, Campo, Modal } from "@/components/ui";

export type ProveedorFormulario = {
  nombre: string;
  contactoNombre: string;
  telefono: string;
  email: string;
  rfc: string;
  notas: string;
};

const INICIAL: ProveedorFormulario = {
  nombre: "",
  contactoNombre: "",
  telefono: "",
  email: "",
  rfc: "",
  notas: "",
};

export function ProveedorFormModal({
  abierto,
  guardando,
  onClose,
  onGuardar,
}: {
  abierto: boolean;
  guardando: boolean;
  onClose: () => void;
  onGuardar: (formulario: ProveedorFormulario) => Promise<void>;
}) {
  const [formulario, setFormulario] = useState(INICIAL);

  useEffect(() => {
    if (abierto) setFormulario(INICIAL);
  }, [abierto]);

  function set(campo: keyof ProveedorFormulario, valor: string) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  return (
    <Modal abierto={abierto} onClose={onClose} titulo="Nuevo proveedor">
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          void onGuardar(formulario);
        }}
        className="space-y-3"
      >
        <Campo
          label="Proveedor o empresa"
          value={formulario.nombre}
          onChange={(evento) => set("nombre", evento.target.value)}
          required
        />
        <Campo
          label="Persona de contacto"
          value={formulario.contactoNombre}
          onChange={(evento) => set("contactoNombre", evento.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="Teléfono"
            value={formulario.telefono}
            onChange={(evento) => set("telefono", evento.target.value)}
          />
          <Campo
            label="RFC"
            value={formulario.rfc}
            onChange={(evento) => set("rfc", evento.target.value)}
          />
        </div>
        <Campo
          label="Correo"
          type="email"
          value={formulario.email}
          onChange={(evento) => set("email", evento.target.value)}
        />
        <Campo
          label="Notas"
          value={formulario.notas}
          onChange={(evento) => set("notas", evento.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Boton type="button" variante="ghost" onClick={onClose}>Cancelar</Boton>
          <Boton type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar proveedor"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
