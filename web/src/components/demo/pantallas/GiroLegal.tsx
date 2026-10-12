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
const camposExpediente = campos.camposExpediente;

export function PantallaLegal() {
  const d = useDatos();
  const exps = (d.extra.expedientesLegales ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const expedientes = exps.map((e) => ({ ...conFechas(e, "fechaInicio"), contacto: d.contactos.find((c) => c.id === e.contactoId) ?? null, responsable: d.usuarios.find((u) => u.id === e.responsableId) ?? null }));
  const total = exps.length;
  const activos = exps.filter((e) => e.estado === "activo").length;
  const suspendidos = exps.filter((e) => e.estado === "suspendido").length;
  const materias = [...new Set(exps.map((e) => e.materia).filter(Boolean))];
  const equipo = d.usuarios.filter((u) => u.activo).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const sucursales = (d.extra.sucursalesLegales ?? []).filter((s) => s.activa);
  return (
    <PanelLegal
      titulo="Expedientes legales"
      descripcion="Asuntos, responsables, etapas procesales y actividad del despacho."
      acciones={<FormularioModulo boton="+ Nuevo expediente" titulo="Nuevo expediente" endpoint="/api/legal/expedientes"
      campos={camposExpediente(opcionesDe(equipo, (u) => u.nombre, "Quien lo registra"), opcionesDe(sucursales, (s) => s.nombre, "Sin sucursal"))} />}
      edicion={{ titulo: "Editar expediente", campos: camposExpediente(opcionesDe(equipo, (u) => u.nombre, "Sin asignar"), opcionesDe(sucursales, (s) => s.nombre, "Sin sucursal")).filter((campo) => campo.tipo !== "contacto") }}
      metricas={[
        { etiqueta: "Expedientes", valor: String(total) },
        { etiqueta: "Activos", valor: String(activos) },
        { etiqueta: "Suspendidos", valor: String(suspendidos) },
        { etiqueta: "Materias", valor: String(materias.length) },
      ]}
      filas={expedientes.map((item) => ({
        id: String(item.id), edicion: { endpoint: `/api/legal/expedientes/${item.id}`, valores: { numeroInterno: textoCampo(item.numeroInterno), materia: textoCampo(item.materia), responsableId: textoCampo(item.responsableId), sucursalId: textoCampo(item.sucursalId), tipoJuicio: textoCampo(item.tipoJuicio), juzgado: textoCampo(item.juzgado), etapaProcesal: textoCampo(item.etapaProcesal), fechaInicio: fechaCampo(item.fechaInicio), cuantia: textoCampo(item.cuantia), estado: textoCampo(item.estado), resumen: textoCampo(item.resumen) } },
        titulo: item.numeroInterno || item.numeroJudicial || `Expediente ${item.id}`,
        subtitulo: [item.contacto?.nombre, item.materia, item.etapaProcesal, item.responsable?.nombre]
          .filter(Boolean)
          .join(" · "),
        estado: item.estado,
        fecha: item.fechaInicio?.toLocaleDateString("es-MX") ?? null,
        href: `/legal/${item.id}`,
      }))}
    />
  );
}
