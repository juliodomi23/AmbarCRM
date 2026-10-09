import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { camposAlumno, camposAlumnoEdicion, fechaCampo, textoCampo } from "@/lib/campos-modulos";

export const dynamic = "force-dynamic";

export default async function AlumnosPage() {
  if (!(await moduloActivo("alumnos"))) redirect("/");
  const [alumnos, total, activos, inscripciones, niveles] = await Promise.all([
    db.alumnoAcademia.findMany({
      include: { contacto: true, inscripciones: true }, orderBy: { createdAt: "desc" }, take: LIMITE_PANEL,
    }),
    db.alumnoAcademia.count(),
    db.alumnoAcademia.count({ where: { estado: "activo" } }),
    db.inscripcionAcademia.count(),
    db.alumnoAcademia.groupBy({ by: ["nivel"], where: { nivel: { not: null } } }),
  ]);
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
