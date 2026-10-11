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
const camposInscripcion = campos.camposInscripcion;
const camposInscripcionEdicion = campos.camposInscripcionEdicion;

export function PantallaInscripcionesAcademia() {
  const d = useDatos();
  const is = (d.extra.inscripciones ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const alumnoDe = (id: string) => { const a = (d.extra.alumnos ?? []).find((x) => x.id === id)!; return { ...a, contacto: d.contactos.find((c) => c.id === a.contactoId)! }; };
  const inscripciones = is.map((i) => ({ ...conFechas(i, "fechaAlta"), alumno: alumnoDe(i.alumnoId), curso: (d.extra.cursos ?? []).find((c) => c.id === i.cursoId)! }));
  const totales = { _count: { _all: is.length }, _avg: { avance: is.length ? suma(is, "avance") / is.length : 0 } };
  const activas = is.filter((i) => i.estado === "activa").length;
  const cursos = [...new Set(is.map((i) => i.cursoId))];
  const alumnosActivos = (d.extra.alumnos ?? []).filter((a) => a.estado === "activo").map((a) => ({ ...a, contacto: d.contactos.find((c) => c.id === a.contactoId)! })).sort((a, b) => a.contacto.nombre.localeCompare(b.contacto.nombre));
  const cursosAbiertos = (d.extra.cursos ?? []).filter((c) => c.estado === "abierto").sort((a, b) => a.nombre.localeCompare(b.nombre));
  return <PanelListado titulo="Inscripciones" descripcion="Altas, bajas y avance por alumno y curso."
    acciones={<FormularioModulo boton="+ Inscribir" titulo="Inscribir alumno" endpoint="/api/academia/inscripciones"
      campos={camposInscripcion(opcionesDe(alumnosActivos, (a) => `${a.contacto.nombre}${a.matricula ? ` · ${a.matricula}` : ""}`, "Elige un alumno"), opcionesDe(cursosAbiertos, (c) => c.nombre, "Elige un curso"))} />}
    edicion={{ titulo: "Editar inscripción", campos: camposInscripcionEdicion(), eliminar: "Borrar inscripción" }}
    metricas={[
      { etiqueta: "Inscripciones", valor: String(totales._count._all) },
      { etiqueta: "Activas", valor: String(activas) },
      { etiqueta: "Cursos", valor: String(cursos.length) },
      { etiqueta: "Avance promedio", valor: `${Math.round(totales._avg.avance ?? 0)}%` },
    ]}
    items={inscripciones.map((item) => ({
      id: String(item.id), edicion: { endpoint: `/api/academia/inscripciones/${item.id}`, valores: { estado: textoCampo(item.estado), avance: textoCampo(item.avance), descuento: textoCampo(item.descuento), notas: textoCampo(item.notas) } }, titulo: item.alumno.contacto.nombre,
      descripcion: `${item.curso.nombre} · Alta ${item.fechaAlta.toLocaleDateString("es-MX")}`,
      estado: item.estado, dato: `${item.avance}%`,
    }))} />;
}
