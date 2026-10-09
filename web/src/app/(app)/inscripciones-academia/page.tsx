import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { LIMITE_OPCIONES, opcionesDe } from "@/lib/opciones-formularios";
import { camposInscripcion, camposInscripcionEdicion, textoCampo } from "@/lib/campos-modulos";

export const dynamic = "force-dynamic";

export default async function InscripcionesAcademiaPage() {
  if (!(await moduloActivo("inscripciones_academia"))) redirect("/");
  const [inscripciones, totales, activas, cursos] = await Promise.all([
    db.inscripcionAcademia.findMany({
      include: { alumno: { include: { contacto: true } }, curso: true },
      orderBy: { createdAt: "desc" },
      take: LIMITE_PANEL,
    }),
    db.inscripcionAcademia.aggregate({ _count: { _all: true }, _avg: { avance: true } }),
    db.inscripcionAcademia.count({ where: { estado: "activa" } }),
    db.inscripcionAcademia.groupBy({ by: ["cursoId"] }),
  ]);
  const alumnosActivos = await db.alumnoAcademia.findMany({
    where: { estado: "activo" }, include: { contacto: true }, orderBy: { contacto: { nombre: "asc" } }, take: LIMITE_OPCIONES,
  });
  const cursosAbiertos = await db.cursoAcademia.findMany({
    where: { estado: "abierto" }, orderBy: { nombre: "asc" }, take: LIMITE_OPCIONES,
  });
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
