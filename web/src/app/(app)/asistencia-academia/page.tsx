import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";

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
  return <PanelListado titulo="Asistencia" descripcion="Pase de lista, retardos, faltas y justificaciones."
    metricas={[
      { etiqueta: "Registros", valor: String(registros) },
      { etiqueta: "Presentes", valor: String(presentes) },
      { etiqueta: "Faltas", valor: String(faltas) },
      { etiqueta: "Retardos", valor: String(retardos) },
    ]}
    items={asistencias.map((item) => ({
      id: String(item.id), titulo: item.alumno.contacto.nombre,
      descripcion: `${item.curso.nombre} · ${item.fecha.toLocaleDateString("es-MX")}`,
      estado: item.estado, dato: item.notas ?? undefined,
    }))} />;
}
