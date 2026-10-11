"use client";

// Contactos: ContactosCliente real con las props de app/(app)/contactos/page.tsx, desde el almacén.
import { ContactosCliente } from "@/components/contactos/ContactosCliente";
import { useDatos } from "@/lib/demo/usar-almacen";

export function PantallaContactos() {
  const d = useDatos();
  const pacientes = Boolean(d.modulos.pacientes?.activo);
  const clientes = Boolean(d.modulos.clientes?.activo);
  return (
    <ContactosCliente
      contactos={d.contactos
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((c) => ({
          id: c.id,
          nombre: c.nombre,
          telefono: c.telefono,
          email: c.email,
          empresa: c.empresa,
          fuente: c.fuente,
          responsableId: c.responsableId,
          responsable: d.usuarios.find((u) => u.id === c.responsableId)?.nombre ?? null,
          optOutDifusion: c.optOutDifusion,
          oportunidades: d.oportunidades.filter((o) => o.contactoId === c.id).length,
          esCliente: c.esCliente,
          campos: c.campos,
          etiquetas: c.etiquetaIds.map((id) => d.etiquetas.find((e) => e.id === id)).filter(Boolean) as { id: string; nombre: string; color: string }[],
        }))}
      etiquetas={d.etiquetas}
      usuarios={d.usuarios.filter((u) => u.activo).map((u) => ({ id: u.id, nombre: u.nombre }))}
      camposPersonalizados={d.camposPersonalizados.filter((c) => c.entidad === "contacto" && c.activo)}
      citasActivo={Boolean(d.modulos.citas?.activo)}
      tipoFicha={pacientes ? "pacientes" : clientes ? "clientes" : null}
    />
  );
}
