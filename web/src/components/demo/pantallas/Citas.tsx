"use client";

// Citas: CitasCliente real con las props de app/(app)/citas/page.tsx, desde el almacén.
import { CitasCliente } from "@/components/citas/CitasCliente";
import { useDatos } from "@/lib/demo/usar-almacen";

export function PantallaCitas() {
  const d = useDatos();
  const conFicha = Boolean(d.modulos.clientes?.activo || d.modulos.pacientes?.activo);
  return (
    <CitasCliente
      contactos={d.contactos
        .filter((c) => !conFicha || c.esCliente)
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map((c) => ({ id: c.id, nombre: c.nombre, expediente: c.esCliente ? { id: c.id } : null }))}
      usuarios={d.usuarios.filter((u) => u.activo).map((u) => ({ id: u.id, nombre: u.nombre }))}
      doctores={d.extra.doctores ?? []}
    />
  );
}
