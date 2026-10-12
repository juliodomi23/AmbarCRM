"use client";

// Automotriz e Inmobiliaria: AutomotrizCliente / InmobiliariaCliente reales con el inventario del almacén.
import { AutomotrizCliente } from "@/components/automotriz/AutomotrizCliente";
import { InmobiliariaCliente } from "@/components/inmobiliaria/InmobiliariaCliente";
import { useDatos } from "@/lib/demo/usar-almacen";

const ordenEstado = (a: { estado: string }, b: { estado: string }) => a.estado.localeCompare(b.estado);

export function PantallaAutomotriz() {
  const d = useDatos();
  return <AutomotrizCliente vehiculos={(d.extra.vehiculos ?? []).slice().sort(ordenEstado) as any} />;
}

export function PantallaInmobiliaria() {
  const d = useDatos();
  return <InmobiliariaCliente propiedades={(d.extra.propiedades ?? []).slice().sort(ordenEstado) as any} />;
}
