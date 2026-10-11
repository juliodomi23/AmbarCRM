"use client";

// Tareas: TareasCliente real con las props de app/(app)/tareas/page.tsx, desde el almacén.
import { TareasCliente } from "@/components/tareas/TareasCliente";
import { useDatos } from "@/lib/demo/usar-almacen";

export function PantallaTareas() {
  const d = useDatos();
  return (
    <TareasCliente
      tareas={d.tareas
        .slice()
        .sort((a, b) => (a.venceAt ?? "9999").localeCompare(b.venceAt ?? "9999"))
        .map((t) => {
          const op = d.oportunidades.find((o) => o.id === t.oportunidadId);
          const contacto = op && d.contactos.find((c) => c.id === op.contactoId);
          return {
            id: t.id,
            titulo: t.titulo,
            descripcion: t.descripcion,
            venceAt: t.venceAt,
            completada: t.completada,
            responsable: d.usuarios.find((u) => u.id === t.responsableId)?.nombre ?? null,
            oportunidad: op ? { id: op.id, titulo: op.titulo, contacto: contacto?.nombre ?? "" } : null,
          };
        })}
      usuarios={d.usuarios.filter((u) => u.activo).map((u) => ({ id: u.id, nombre: u.nombre }))}
    />
  );
}
