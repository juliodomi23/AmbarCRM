import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";

export const dynamic = "force-dynamic";

export default async function InscripcionesAcademiaPage() {
  if (!(await moduloActivo("inscripciones_academia"))) redirect("/");
  const inscripciones = await db.inscripcionAcademia.findMany({
    include: { alumno: { include: { contacto: true } }, curso: true },
    orderBy: { createdAt: "desc" },
  });
  return <PanelListado titulo="Inscripciones" descripcion="Altas, bajas y avance por alumno y curso."
    metricas={[
      { etiqueta: "Inscripciones", valor: String(inscripciones.length) },
      { etiqueta: "Activas", valor: String(inscripciones.filter((item) => item.estado === "activa").length) },
      { etiqueta: "Cursos", valor: String(new Set(inscripciones.map((item) => String(item.cursoId))).size) },
      { etiqueta: "Avance promedio", valor: inscripciones.length
        ? `${Math.round(inscripciones.reduce((suma, item) => suma + item.avance, 0) / inscripciones.length)}%`
        : "0%" },
    ]}
    items={inscripciones.map((item) => ({
      id: String(item.id), titulo: item.alumno.contacto.nombre,
      descripcion: `${item.curso.nombre} · Alta ${item.fechaAlta.toLocaleDateString("es-MX")}`,
      estado: item.estado, dato: `${item.avance}%`,
    }))} />;
}
