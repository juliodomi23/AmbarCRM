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
const camposReserva = campos.camposReserva;
const camposReservaEdicion = campos.camposReservaEdicion;

export function PantallaReservasTours() {
  const d = useDatos();
  const rs = (d.extra.reservasTour ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const reservas = rs.map((r) => ({ ...conFechas(r, "fechaSalida"), contacto: d.contactos.find((c) => c.id === r.contactoId)!, tour: (d.extra.tours ?? []).find((t) => t.id === r.tourId)! }));
  const totales = { _count: { _all: rs.length }, _sum: { viajeros: suma(rs, "viajeros"), saldo: suma(rs, "saldo") } };
  const confirmadas = rs.filter((r) => r.estado === "confirmada").length;
  const toursAbiertos = (d.extra.tours ?? []).filter((t) => t.estado !== "cerrado").map((t) => conFechas(t, "fechaSalida"));
  const moneda = (valor: number) => valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  return <PanelListado titulo="Reservas y viajeros" descripcion="Apartados, pasajeros, salidas y saldos."
    acciones={<FormularioModulo boton="+ Nueva reserva" titulo="Nueva reserva" endpoint="/api/viajes/reservas"
      campos={camposReserva(opcionesDe(toursAbiertos, (t) => `${t.nombre}${t.fechaSalida ? ` · ${t.fechaSalida.toLocaleDateString("es-MX")}` : ""}`, "Elige un tour"))} />}
    edicion={{ titulo: "Editar reserva", campos: camposReservaEdicion(), eliminar: "Borrar reserva" }}
    metricas={[
      { etiqueta: "Reservas", valor: String(totales._count._all) },
      { etiqueta: "Confirmadas", valor: String(confirmadas) },
      { etiqueta: "Viajeros", valor: String(totales._sum.viajeros ?? 0) },
      { etiqueta: "Saldo pendiente", valor: moneda(Number(totales._sum.saldo ?? 0)) },
    ]}
    items={reservas.map((reserva) => ({
      id: String(reserva.id), edicion: { endpoint: `/api/viajes/reservas/${reserva.id}`, valores: { estado: textoCampo(reserva.estado), viajeros: textoCampo(reserva.viajeros), total: textoCampo(reserva.total), fechaSalida: fechaCampo(reserva.fechaSalida), notas: textoCampo(reserva.notas) } }, titulo: `${reserva.codigo} · ${reserva.contacto.nombre}`,
      descripcion: `${reserva.tour.nombre} · ${reserva.viajeros} viajero(s)`,
      estado: reserva.estado, dato: moneda(Number(reserva.saldo)),
    }))} />;
}
