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
const camposAsistencia = campos.camposAsistencia;
const camposAsistenciaEdicion = campos.camposAsistenciaEdicion;

export function PantallaAsistenciaAcademia() {
  const d = useDatos();
  const as = (d.extra.asistencias ?? []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const alumnoDe = (id: string) => { const a = (d.extra.alumnos ?? []).find((x) => x.id === id)!; return { ...a, contacto: d.contactos.find((c) => c.id === a.contactoId)! }; };
  const asistencias = as.map((a) => ({ ...conFechas(a, "fecha"), alumno: alumnoDe(a.alumnoId), curso: (d.extra.cursos ?? []).find((c) => c.id === a.cursoId)! }));
  const registros = as.length;
  const presentes = as.filter((a) => a.estado === "presente").length;
  const faltas = as.filter((a) => a.estado === "falta").length;
  const retardos = as.filter((a) => a.estado === "retardo").length;
  const alumnosActivos = (d.extra.alumnos ?? []).filter((a) => a.estado === "activo").map((a) => ({ ...a, contacto: d.contactos.find((c) => c.id === a.contactoId)! })).sort((a, b) => a.contacto.nombre.localeCompare(b.contacto.nombre));
  const cursosAbiertos = (d.extra.cursos ?? []).filter((c) => c.estado === "abierto").sort((a, b) => a.nombre.localeCompare(b.nombre));
  return <PanelListado titulo="Asistencia" descripcion="Pase de lista, retardos, faltas y justificaciones."
    acciones={<FormularioModulo boton="+ Pasar lista" titulo="Registrar asistencia" endpoint="/api/academia/asistencia"
      campos={camposAsistencia(opcionesDe(alumnosActivos, (a) => `${a.contacto.nombre}${a.matricula ? ` · ${a.matricula}` : ""}`, "Elige un alumno"), opcionesDe(cursosAbiertos, (c) => c.nombre, "Elige un curso"))} />}
    edicion={{ titulo: "Editar asistencia", campos: camposAsistenciaEdicion(), eliminar: "Borrar registro" }}
    metricas={[
      { etiqueta: "Registros", valor: String(registros) },
      { etiqueta: "Presentes", valor: String(presentes) },
      { etiqueta: "Faltas", valor: String(faltas) },
      { etiqueta: "Retardos", valor: String(retardos) },
    ]}
    items={asistencias.map((item) => ({
      id: String(item.id), edicion: { endpoint: `/api/academia/asistencia/${item.id}`, valores: { estado: textoCampo(item.estado), notas: textoCampo(item.notas) } }, titulo: item.alumno.contacto.nombre,
      descripcion: `${item.curso.nombre} · ${item.fecha.toLocaleDateString("es-MX")}`,
      estado: item.estado, dato: item.notas ?? undefined,
    }))} />;
}
