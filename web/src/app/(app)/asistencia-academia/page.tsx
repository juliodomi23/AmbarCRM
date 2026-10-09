import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { LIMITE_OPCIONES, opcionesDe } from "@/lib/opciones-formularios";
import { camposAsistencia, camposAsistenciaEdicion, textoCampo } from "@/lib/campos-modulos";

export const dynamic = "force-dynamic";

export default async function AsistenciaAcademiaPage() {
  if (!(await moduloActivo("asistencia_academia"))) redirect("/");
  const contar = (estado?: string) => db.asistenciaAcademia.count({ where: estado ? { estado } : undefined });
  const [asistencias, registros, presentes, faltas, retardos] = await Promise.all([
    db.asistenciaAcademia.findMany({
      include: { alumno: { include: { contacto: true } }, curso: true },
      orderBy: { fecha: "desc" },
      take: LIMITE_PANEL,
    }),
    contar(), contar("presente"), contar("falta"), contar("retardo"),
  ]);
  const alumnosActivos = await db.alumnoAcademia.findMany({
    where: { estado: "activo" }, include: { contacto: true }, orderBy: { contacto: { nombre: "asc" } }, take: LIMITE_OPCIONES,
  });
  const cursosAbiertos = await db.cursoAcademia.findMany({
    where: { estado: "abierto" }, orderBy: { nombre: "asc" }, take: LIMITE_OPCIONES,
  });
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
