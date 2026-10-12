"use client";

// Pacientes / Clientes: ClientesCliente y ExpedienteCliente reales con las props de los page.tsx, desde el almacén.
import { ClientesCliente } from "@/components/clientes/ClientesCliente";
import { ExpedienteCliente } from "@/components/contactos/ExpedienteCliente";
import { useDatos } from "@/lib/demo/usar-almacen";
import type { Datos } from "@/lib/demo/tipos";
import { PantallaNoDisponible } from "./NoDisponible";

const citasDe = (d: Datos, contactoId: string) =>
  (d.extra.citas ?? [])
    .filter((c) => c.contactoId === contactoId)
    .sort((a, b) => b.inicio.localeCompare(a.inicio))
    .map((c) => ({ id: c.id, titulo: c.titulo, inicio: c.inicio, estado: c.estado, doctor: (d.extra.doctores ?? []).find((x) => x.id === c.doctorId) ?? null }));

export function PantallaFichas({ modo }: { modo: "pacientes" | "clientes" }) {
  const d = useDatos();
  const expedientes = d.extra.expedientes ?? [];
  const conFicha = d.contactos.filter((c) => expedientes.some((e) => e.contactoId === c.id)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  return (
    <ClientesCliente
      clientes={conFicha.map((c) => {
        const e = expedientes.find((x) => x.contactoId === c.id)!;
        return {
          id: c.id, nombre: c.nombre, telefono: c.telefono, email: c.email,
          expediente: { fechaNacimiento: e.fechaNacimiento, sexo: e.sexo, alergias: e.alergias, antecedentes: e.antecedentes },
          citas: citasDe(d, c.id).slice(0, 10),
        };
      })}
      contactosDisponibles={d.contactos
        .filter((c) => !expedientes.some((e) => e.contactoId === c.id))
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono, email: c.email }))}
      citasActivo={Boolean(d.modulos.citas?.activo)}
      {...(modo === "pacientes" ? { modo: "pacientes" as const } : {})}
    />
  );
}

export function PantallaExpediente({ modo, id }: { modo: "pacientes" | "clientes"; id: string }) {
  const d = useDatos();
  const contacto = d.contactos.find((c) => c.id === id);
  const e = (d.extra.expedientes ?? []).find((x) => x.contactoId === id);
  if (!contacto || !e) return <PantallaNoDisponible ruta={`/${modo}/${id}`} />;
  const cita = (cid: string | null) => {
    const c = cid ? (d.extra.citas ?? []).find((x) => x.id === cid) : null;
    return c ? { id: c.id, titulo: c.titulo } : null;
  };
  return (
    <ExpedienteCliente
      key={id}
      contacto={{
        id: contacto.id, nombre: contacto.nombre, telefono: contacto.telefono, email: contacto.email,
        expediente: {
          fechaNacimiento: e.fechaNacimiento, sexo: e.sexo, alergias: e.alergias, antecedentes: e.antecedentes, medicamentos: e.medicamentos, observaciones: e.observaciones,
          evoluciones: e.evoluciones.slice().sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt)).map((v: any) => {
            const u = d.usuarios.find((x) => x.id === v.registradoPorId);
            return { id: v.id, contenido: v.contenido, createdAt: v.createdAt, doctor: (d.extra.doctores ?? []).find((x) => x.id === v.doctorId) ?? null, cita: cita(v.citaId), registradoPor: u ? { id: u.id, nombre: u.nombre } : null };
          }),
        },
      }}
      doctores={(d.extra.doctores ?? []).filter((x) => x.activo).sort((a, b) => a.nombre.localeCompare(b.nombre))}
      citas={citasDe(d, id).slice(0, 20).map((c) => ({ id: c.id, titulo: c.titulo, inicio: c.inicio, doctor: c.doctor }))}
      citasActivo={Boolean(d.modulos.citas?.activo)}
      modo={modo}
    />
  );
}
