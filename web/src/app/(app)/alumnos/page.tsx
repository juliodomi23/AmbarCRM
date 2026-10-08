import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { hoyMexico, LIMITE_OPCIONES, OPCIONES, opcionesDe } from "@/lib/opciones-formularios";

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
      campos={[
        { nombre: "contactoId", etiqueta: "Alumno (contacto)", tipo: "contacto", requerido: true },
        { nombre: "matricula", etiqueta: "Matrícula", tipo: "texto" },
        { nombre: "nivel", etiqueta: "Nivel", tipo: "texto" },
        { nombre: "fechaNacimiento", etiqueta: "Fecha de nacimiento", tipo: "fecha" },
        { nombre: "tutorNombre", etiqueta: "Tutor", tipo: "texto" },
        { nombre: "tutorTelefono", etiqueta: "Teléfono del tutor", tipo: "texto" },
        { nombre: "estado", etiqueta: "Estado", tipo: "seleccion", opciones: OPCIONES.estadoAlumno },
        { nombre: "observaciones", etiqueta: "Observaciones", tipo: "textarea" },
      ]} />}
    metricas={[
      { etiqueta: "Alumnos", valor: String(total) },
      { etiqueta: "Activos", valor: String(activos) },
      { etiqueta: "Inscripciones", valor: String(inscripciones) },
      { etiqueta: "Niveles", valor: String(niveles.length) },
    ]}
    items={alumnos.map((alumno) => ({
      id: String(alumno.id), titulo: alumno.contacto.nombre,
      descripcion: [alumno.matricula, alumno.nivel, alumno.tutorNombre && `Tutor: ${alumno.tutorNombre}`]
        .filter(Boolean).join(" · "),
      estado: alumno.estado, dato: `${alumno.inscripciones.length} curso(s)`,
    }))} />;
}
