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
const camposMovimiento = campos.camposMovimiento;

export function PantallaFinanzasLegales() {
  const d = useDatos();
  const lista = (d.extra.movimientosLegales ?? []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const movimientos = lista.map((m) => ({ ...conFechas(m, "fecha"), contacto: d.contactos.find((c) => c.id === m.contactoId) ?? null, expediente: (d.extra.expedientesLegales ?? []).find((e) => e.id === m.expedienteId) ?? null }));
  const cantidad = lista.length;
  const porTipo = ["pago", "plan_pago", "gasto", "diligencia"].map((tipo) => ({ tipo, _count: { _all: lista.filter((m) => m.tipo === tipo).length }, _sum: { monto: suma(lista.filter((m) => m.tipo === tipo), "monto") } }));
  const deTipo = (tipo: string) => porTipo.find((item) => item.tipo === tipo);
  const total = (tipo: string) => Number(deTipo(tipo)?._sum.monto ?? 0);
  const moneda = (valor: number) => valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  const expedientesOpciones = (d.extra.expedientesLegales ?? []).filter((e) => ["activo", "suspendido"].includes(e.estado)).map((e) => ({ ...e, contacto: d.contactos.find((c) => c.id === e.contactoId) ?? null }));
  return <PanelLegal titulo="Honorarios y caja" descripcion="Planes, cobros, gastos, caja y diligencias."
    acciones={<FormularioModulo boton="+ Nuevo movimiento" titulo="Nuevo movimiento" endpoint="/api/legal/movimientos"
      campos={camposMovimiento(opcionesDe(expedientesOpciones, (e) => [e.numeroInterno, e.materia, e.contacto?.nombre].filter(Boolean).join(" · "), "Sin expediente"))} />}
    edicion={{ titulo: "Editar movimiento", campos: camposMovimiento(opcionesDe(expedientesOpciones, (e) => [e.numeroInterno, e.materia, e.contacto?.nombre].filter(Boolean).join(" · "), "Sin expediente")), eliminar: "Borrar movimiento" }}
    metricas={[
      { etiqueta: "Movimientos", valor: String(cantidad) },
      { etiqueta: "Cobrado", valor: moneda(total("pago")) },
      { etiqueta: "Planes", valor: String(deTipo("plan_pago")?._count._all ?? 0) },
      { etiqueta: "Gastos", valor: moneda(total("gasto") + total("diligencia")) },
    ]}
    filas={movimientos.map((item) => ({
      id: String(item.id), edicion: { endpoint: `/api/legal/movimientos/${item.id}`, valores: { tipo: textoCampo(item.tipo), concepto: textoCampo(item.concepto), monto: textoCampo(item.monto), expedienteId: textoCampo(item.expedienteId), fecha: fechaCampo(item.fecha) } }, titulo: item.concepto,
      subtitulo: [item.contacto?.nombre, item.expediente?.numeroInterno, item.tipo].filter(Boolean).join(" · "),
      estado: item.estado || item.tipo, fecha: item.fecha?.toLocaleDateString("es-MX") ?? null,
      importe: Number(item.monto),
    }))} />;
}
