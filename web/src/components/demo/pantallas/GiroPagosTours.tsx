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
const camposPago = campos.camposPago;
const camposPagoEdicion = campos.camposPagoEdicion;

export function PantallaPagosTours() {
  const d = useDatos();
  const ps = (d.extra.pagosTour ?? []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const reservaDe = (id: string) => {
    const r = (d.extra.reservasTour ?? []).find((x) => x.id === id)!;
    return { ...r, contacto: d.contactos.find((c) => c.id === r.contactoId)!, tour: (d.extra.tours ?? []).find((t) => t.id === r.tourId)! };
  };
  const pagos = ps.map((p) => ({ ...conFechas(p, "fecha"), reserva: reservaDe(p.reservaId) }));
  const totales = { _count: { _all: ps.length }, _sum: { monto: suma(ps, "monto") } };
  const aplicados = ps.filter((p) => p.estado === "aplicado").length;
  const metodos = [...new Set(ps.map((p) => p.metodo).filter(Boolean))];
  const conSaldo = (d.extra.reservasTour ?? []).filter((r) => r.saldo > 0).map((r) => ({ ...r, contacto: d.contactos.find((c) => c.id === r.contactoId)! }));
  const moneda = (valor: number) => valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  return <PanelListado titulo="Cobranza de viajes" descripcion="Anticipos y liquidaciones de las reservas."
    acciones={<FormularioModulo boton="+ Registrar pago" titulo="Registrar pago" endpoint="/api/viajes/pagos"
      campos={camposPago(opcionesDe(conSaldo, (r) => `${r.codigo} · ${r.contacto.nombre} · saldo ${Number(r.saldo).toLocaleString("es-MX", { style: "currency", currency: "MXN" })}`, "Elige una reserva con saldo"))} />}
    edicion={{ titulo: "Pago", campos: camposPagoEdicion(), acciones: [{ etiqueta: "Cancelar pago", cuerpo: { estado: "cancelado" } }] }}
    metricas={[
      { etiqueta: "Movimientos", valor: String(totales._count._all) },
      { etiqueta: "Cobrado", valor: moneda(Number(totales._sum.monto ?? 0)) },
      { etiqueta: "Aplicados", valor: String(aplicados) },
      { etiqueta: "Métodos", valor: String(metodos.length) },
    ]}
    items={pagos.map((pago) => ({
      id: String(pago.id), edicion: { endpoint: `/api/viajes/pagos/${pago.id}`, valores: { concepto: textoCampo(pago.concepto), metodo: textoCampo(pago.metodo), referencia: textoCampo(pago.referencia) } }, titulo: `${pago.concepto} · ${pago.reserva.contacto.nombre}`,
      descripcion: `${pago.reserva.codigo} · ${pago.reserva.tour.nombre} · ${pago.metodo ?? "Sin método"}`,
      estado: pago.estado, dato: moneda(Number(pago.monto)),
    }))} />;
}
