import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";

export const dynamic = "force-dynamic";

export default async function AsistenciaAcademiaPage() {
  if (!(await moduloActivo("asistencia_academia"))) redirect("/");
  const asistencias = await db.asistenciaAcademia.findMany({
    include: { alumno: { include: { contacto: true } }, curso: true },
    orderBy: { fecha: "desc" },
  });
  return <PanelListado titulo="Asistencia" descripcion="Pase de lista, retardos, faltas y justificaciones."
    metricas={[
      { etiqueta: "Registros", valor: String(asistencias.length) },
      { etiqueta: "Presentes", valor: String(asistencias.filter((item) => item.estado === "presente").length) },
      { etiqueta: "Faltas", valor: String(asistencias.filter((item) => item.estado === "falta").length) },
      { etiqueta: "Retardos", valor: String(asistencias.filter((item) => item.estado === "retardo").length) },
    ]}
    items={asistencias.map((item) => ({
      id: String(item.id), titulo: item.alumno.contacto.nombre,
      descripcion: `${item.curso.nombre} · ${item.fecha.toLocaleDateString("es-MX")}`,
      estado: item.estado, dato: item.notas ?? undefined,
    }))} />;
}
