import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";

export const dynamic = "force-dynamic";

export default async function CursosAcademiaPage() {
  if (!(await moduloActivo("cursos_academia"))) redirect("/");
  const cursos = await db.cursoAcademia.findMany({
    include: { inscripciones: true }, orderBy: { nombre: "asc" },
  });
  const moneda = (valor: number) => valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  return <PanelListado titulo="Cursos y grupos" descripcion="Profesores, horarios, capacidad y mensualidad."
    metricas={[
      { etiqueta: "Cursos", valor: String(cursos.length) },
      { etiqueta: "Abiertos", valor: String(cursos.filter((item) => item.estado === "abierto").length) },
      { etiqueta: "Inscritos", valor: String(cursos.reduce((suma, item) => suma + item.inscripciones.length, 0)) },
      { etiqueta: "Cupo", valor: String(cursos.reduce((suma, item) => suma + item.capacidad, 0)) },
    ]}
    items={cursos.map((curso) => ({
      id: String(curso.id), titulo: curso.nombre,
      descripcion: [curso.categoria, curso.modalidad, curso.profesor, curso.horario].filter(Boolean).join(" · "),
      estado: curso.estado, dato: `${moneda(Number(curso.mensualidad))}/mes`,
    }))} />;
}
