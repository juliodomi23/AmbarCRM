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
const camposAlumno = campos.camposAlumno;
const camposAlumnoEdicion = campos.camposAlumnoEdicion;

export function PantallaAlumnos() {
  const d = useDatos();
  const lista = (d.extra.alumnos ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const alumnos = lista.map((a) => ({ ...conFechas(a, "fechaNacimiento"), contacto: d.contactos.find((c) => c.id === a.contactoId)!, inscripciones: (d.extra.inscripciones ?? []).filter((i) => i.alumnoId === a.id) }));
  const total = lista.length;
  const activos = lista.filter((a) => a.estado === "activo").length;
  const inscripciones = (d.extra.inscripciones ?? []).length;
  const niveles = [...new Set(lista.map((a) => a.nivel).filter(Boolean))];
  return <PanelListado titulo="Alumnos" descripcion="Matrículas, tutores, niveles e historial académico."
    acciones={<FormularioModulo boton="+ Nuevo alumno" titulo="Nuevo alumno" endpoint="/api/academia/alumnos"
      campos={camposAlumno()} />}
    edicion={{ titulo: "Editar alumno", campos: camposAlumnoEdicion(), eliminar: "Borrar alumno" }}
    metricas={[
      { etiqueta: "Alumnos", valor: String(total) },
      { etiqueta: "Activos", valor: String(activos) },
      { etiqueta: "Inscripciones", valor: String(inscripciones) },
      { etiqueta: "Niveles", valor: String(niveles.length) },
    ]}
    items={alumnos.map((alumno) => ({
      id: String(alumno.id), edicion: { endpoint: `/api/academia/alumnos/${alumno.id}`, valores: { matricula: textoCampo(alumno.matricula), nivel: textoCampo(alumno.nivel), fechaNacimiento: fechaCampo(alumno.fechaNacimiento), tutorNombre: textoCampo(alumno.tutorNombre), tutorTelefono: textoCampo(alumno.tutorTelefono), estado: textoCampo(alumno.estado), observaciones: textoCampo(alumno.observaciones) } }, titulo: alumno.contacto.nombre,
      descripcion: [alumno.matricula, alumno.nivel, alumno.tutorNombre && `Tutor: ${alumno.tutorNombre}`]
        .filter(Boolean).join(" · "),
      estado: alumno.estado, dato: `${alumno.inscripciones.length} curso(s)`,
    }))} />;
}
