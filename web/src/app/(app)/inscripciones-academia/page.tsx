import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";

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
  return <PanelListado titulo="Inscripciones" descripcion="Altas, bajas y avance por alumno y curso."
    metricas={[
      { etiqueta: "Inscripciones", valor: String(totales._count._all) },
      { etiqueta: "Activas", valor: String(activas) },
      { etiqueta: "Cursos", valor: String(cursos.length) },
      { etiqueta: "Avance promedio", valor: `${Math.round(totales._avg.avance ?? 0)}%` },
    ]}
    items={inscripciones.map((item) => ({
      id: String(item.id), titulo: item.alumno.contacto.nombre,
      descripcion: `${item.curso.nombre} · Alta ${item.fechaAlta.toLocaleDateString("es-MX")}`,
      estado: item.estado, dato: `${item.avance}%`,
    }))} />;
}
