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
const camposCurso = campos.camposCurso;

export function PantallaCursosAcademia() {
  const d = useDatos();
  const lista = (d.extra.cursos ?? []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  const cursos = lista.map((c) => conFechas(c, "fechaInicio", "fechaFin"));
  const total = lista.length;
  const abiertos = lista.filter((c) => c.estado === "abierto").length;
  const inscritos = (d.extra.inscripciones ?? []).length;
  const cupo = { _sum: { capacidad: suma(lista, "capacidad") } };
  const moneda = (valor: number) => valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  return <PanelListado titulo="Cursos y grupos" descripcion="Profesores, horarios, capacidad y mensualidad."
    acciones={<FormularioModulo boton="+ Nuevo curso" titulo="Nuevo curso o grupo" endpoint="/api/academia/cursos"
      campos={camposCurso()} />}
    edicion={{ titulo: "Editar curso", campos: camposCurso(), eliminar: "Borrar curso" }}
    metricas={[
      { etiqueta: "Cursos", valor: String(total) },
      { etiqueta: "Abiertos", valor: String(abiertos) },
      { etiqueta: "Inscritos", valor: String(inscritos) },
      { etiqueta: "Cupo", valor: String(cupo._sum.capacidad ?? 0) },
    ]}
    items={cursos.map((curso) => ({
      id: String(curso.id), edicion: { endpoint: `/api/academia/cursos/${curso.id}`, valores: { nombre: textoCampo(curso.nombre), categoria: textoCampo(curso.categoria), modalidad: textoCampo(curso.modalidad), profesor: textoCampo(curso.profesor), horario: textoCampo(curso.horario), fechaInicio: fechaCampo(curso.fechaInicio), fechaFin: fechaCampo(curso.fechaFin), capacidad: textoCampo(curso.capacidad), mensualidad: textoCampo(curso.mensualidad), estado: textoCampo(curso.estado) } }, titulo: curso.nombre,
      descripcion: [curso.categoria, curso.modalidad, curso.profesor, curso.horario].filter(Boolean).join(" · "),
      estado: curso.estado, dato: `${moneda(Number(curso.mensualidad))}/mes`,
    }))} />;
}
