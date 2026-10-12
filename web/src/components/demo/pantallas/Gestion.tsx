"use client";

// Difusión y Personal: DifusionCliente y PersonalCliente reales con las props de sus page.tsx, desde el almacén.
// Difusión se simula por completo: nunca sale un mensaje.
import { DifusionCliente } from "@/components/difusion/DifusionCliente";
import { PersonalCliente } from "@/components/personal/PersonalCliente";
import { useDatos } from "@/lib/demo/usar-almacen";

export function PantallaDifusion() {
  const d = useDatos();
  return (
    <DifusionCliente
      etiquetas={d.etiquetas.map((e) => ({ id: e.id, nombre: e.nombre, color: e.color, total: d.contactos.filter((c) => c.etiquetaIds.includes(e.id)).length }))}
      plantillas={d.plantillas}
      canales={[{ id: "demo", nombre: "WhatsApp principal (demo: no envía)", activo: true }]}
    />
  );
}

export function PantallaPersonal() {
  const d = useDatos();
  const ultimo = (id: string) => d.mensajes.filter((m) => m.conversacionId === id).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  const items = d.conversaciones
    .filter((c) => d.contactos.find((x) => x.id === c.contactoId)?.esPersonal)
    .sort((a, b) => (b.ultimoMensajeAt ?? "").localeCompare(a.ultimoMensajeAt ?? ""))
    .map((c) => {
      const contacto = d.contactos.find((x) => x.id === c.contactoId)!;
      const m = ultimo(c.id);
      return { id: c.id, contactoId: contacto.id, nombre: contacto.nombre, telefono: contacto.telefono, noLeidos: c.noLeidos, ultimoMensajeAt: c.ultimoMensajeAt, preview: m?.contenido ?? (m ? "[archivo]" : "") };
    });
  return <PersonalCliente itemsIniciales={items} />;
}
