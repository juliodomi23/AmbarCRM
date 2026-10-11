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
const camposColegiatura = campos.camposColegiatura;
const camposColegiaturaEdicion = campos.camposColegiaturaEdicion;

export function PantallaColegiaturas() {
  const d = useDatos();
  const todas = d.extra.colegiaturas ?? [];
  const pend = todas.filter((c) => c.estado !== "pagada");
  const colegiaturas = pend.slice().sort((a, b) => a.vencimiento.localeCompare(b.vencimiento)).map((c) => {
    const a = (d.extra.alumnos ?? []).find((x) => x.id === c.alumnoId)!;
    return { ...conFechas(c, "vencimiento"), alumno: { ...a, contacto: d.contactos.find((x) => x.id === a.contactoId)! } };
  });
  const cargos = todas.length;
  const pendientes = { _count: { _all: pend.length }, _sum: { monto: suma(pend, "monto") } };
  const pagadas = todas.filter((c) => c.estado === "pagada").length;
  const alumnosActivos = (d.extra.alumnos ?? []).filter((a) => a.estado === "activo").map((a) => ({ ...a, contacto: d.contactos.find((c) => c.id === a.contactoId)! })).sort((a, b) => a.contacto.nombre.localeCompare(b.contacto.nombre));
  const moneda = (valor: number) => valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  return <PanelListado titulo="Colegiaturas" descripcion="Cargos pendientes por vencimiento y cartera por cobrar."
    acciones={<FormularioModulo boton="+ Nuevo cargo" titulo="Nuevo cargo de colegiatura" endpoint="/api/academia/colegiaturas"
      campos={camposColegiatura(opcionesDe(alumnosActivos, (a) => `${a.contacto.nombre}${a.matricula ? ` · ${a.matricula}` : ""}`, "Elige un alumno"))} />}
    edicion={{ titulo: "Editar colegiatura", campos: camposColegiaturaEdicion(), eliminar: "Borrar cargo" }}
    metricas={[
      { etiqueta: "Cargos", valor: String(cargos) },
      { etiqueta: "Pendientes", valor: String(pendientes._count._all) },
      { etiqueta: "Por cobrar", valor: moneda(Number(pendientes._sum.monto ?? 0)) },
      { etiqueta: "Pagadas", valor: String(pagadas) },
    ]}
    items={colegiaturas.map((item) => ({
      id: String(item.id), edicion: { endpoint: `/api/academia/colegiaturas/${item.id}`, valores: { concepto: textoCampo(item.concepto), periodo: textoCampo(item.periodo), monto: textoCampo(item.monto), vencimiento: fechaCampo(item.vencimiento), estado: textoCampo(item.estado), metodo: textoCampo(item.metodo) } }, titulo: `${item.concepto} · ${item.alumno.contacto.nombre}`,
      descripcion: `${item.periodo ?? "Sin periodo"} · Vence ${item.vencimiento.toLocaleDateString("es-MX")}`,
      estado: item.estado, dato: moneda(Number(item.monto)),
    }))} />;
}
