import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";

export const dynamic = "force-dynamic";

export default async function AlumnosPage() {
  if (!(await moduloActivo("alumnos"))) redirect("/");
  const alumnos = await db.alumnoAcademia.findMany({
    include: { contacto: true, inscripciones: true }, orderBy: { createdAt: "desc" },
  });
  return <PanelListado titulo="Alumnos" descripcion="Matrículas, tutores, niveles e historial académico."
    metricas={[
      { etiqueta: "Alumnos", valor: String(alumnos.length) },
      { etiqueta: "Activos", valor: String(alumnos.filter((item) => item.estado === "activo").length) },
      { etiqueta: "Inscripciones", valor: String(alumnos.reduce((suma, item) => suma + item.inscripciones.length, 0)) },
      { etiqueta: "Niveles", valor: String(new Set(alumnos.map((item) => item.nivel).filter(Boolean)).size) },
    ]}
    items={alumnos.map((alumno) => ({
      id: String(alumno.id), titulo: alumno.contacto.nombre,
      descripcion: [alumno.matricula, alumno.nivel, alumno.tutorNombre && `Tutor: ${alumno.tutorNombre}`]
        .filter(Boolean).join(" · "),
      estado: alumno.estado, dato: `${alumno.inscripciones.length} curso(s)`,
    }))} />;
}
