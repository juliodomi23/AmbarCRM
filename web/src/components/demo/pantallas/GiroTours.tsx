"use client";

import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { PanelListado } from "@/components/modulos/PanelListado";
import { PanelLegal } from "@/components/legal/PanelLegal";
import { opcionesDe as opcionesTipadas } from "@/lib/opciones-formularios";
import * as campos from "@/lib/campos-modulos";
import { fechaCampo, textoCampo } from "@/lib/campos-modulos";
import { useDatos } from "@/lib/demo/usar-almacen";
import { conFechas, suma } from "./giro-util";

// Las filas del almacén traen ids string (como las serializadas del CRM); el tipo del helper pide bigint de Prisma.
const opcionesDe = (lista: any[], etiqueta: (x: any) => string, vacia?: string) => opcionesTipadas(lista as any, etiqueta, vacia);
const camposTour = campos.camposTour;

export function PantallaTours() {
  const d = useDatos();
  const lista = (d.extra.tours ?? []).slice().sort((a, b) => (a.fechaSalida ?? "").localeCompare(b.fechaSalida ?? "") || a.nombre.localeCompare(b.nombre));
  const tours = lista.map((t) => conFechas(t, "fechaSalida", "fechaRegreso"));
  const total = lista.length;
  const publicadas = lista.filter((t) => t.estado === "publicado").length;
  const viajeros = { _sum: { viajeros: suma(d.extra.reservasTour ?? [], "viajeros") } };
  const cupo = { _sum: { capacidad: suma(lista, "capacidad") } };
  return <PanelListado titulo="Tours y salidas" descripcion="Experiencias, itinerarios, fechas, precios y cupo."
    acciones={<FormularioModulo boton="+ Nuevo tour" titulo="Nuevo tour" endpoint="/api/viajes/tours"
      campos={camposTour()} />}
    edicion={{ titulo: "Editar tour", campos: camposTour(), eliminar: "Borrar tour" }}
    metricas={[
      { etiqueta: "Experiencias", valor: String(total) },
      { etiqueta: "Publicadas", valor: String(publicadas) },
      { etiqueta: "Viajeros", valor: String(viajeros._sum.viajeros ?? 0) },
      { etiqueta: "Cupo total", valor: String(cupo._sum.capacidad ?? 0) },
    ]}
    items={tours.map((tour) => ({
      id: String(tour.id), edicion: { endpoint: `/api/viajes/tours/${tour.id}`, valores: { nombre: textoCampo(tour.nombre), destino: textoCampo(tour.destino), pais: textoCampo(tour.pais), fechaSalida: fechaCampo(tour.fechaSalida), fechaRegreso: fechaCampo(tour.fechaRegreso), duracionDias: textoCampo(tour.duracionDias), capacidad: textoCampo(tour.capacidad), precio: textoCampo(tour.precio), puntoEncuentro: textoCampo(tour.puntoEncuentro), incluye: textoCampo(tour.incluye), estado: textoCampo(tour.estado) } }, titulo: tour.nombre,
      descripcion: [tour.destino, tour.pais, `${tour.duracionDias} días`, tour.fechaSalida?.toLocaleDateString("es-MX")]
        .filter(Boolean).join(" · "),
      estado: tour.estado,
      dato: Number(tour.precio).toLocaleString("es-MX", { style: "currency", currency: tour.moneda }),
    }))} />;
}
