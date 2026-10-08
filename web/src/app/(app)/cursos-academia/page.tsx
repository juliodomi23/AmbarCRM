import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";

export const dynamic = "force-dynamic";

export default async function CursosAcademiaPage() {
  if (!(await moduloActivo("cursos_academia"))) redirect("/");
  const [cursos, total, abiertos, inscritos, cupo] = await Promise.all([
    db.cursoAcademia.findMany({
      orderBy: { nombre: "asc" }, take: LIMITE_PANEL,
    }),
    db.cursoAcademia.count(),
    db.cursoAcademia.count({ where: { estado: "abierto" } }),
    db.inscripcionAcademia.count(),
    db.cursoAcademia.aggregate({ _sum: { capacidad: true } }),
  ]);
  const moneda = (valor: number) => valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  return <PanelListado titulo="Cursos y grupos" descripcion="Profesores, horarios, capacidad y mensualidad."
    metricas={[
      { etiqueta: "Cursos", valor: String(total) },
      { etiqueta: "Abiertos", valor: String(abiertos) },
      { etiqueta: "Inscritos", valor: String(inscritos) },
      { etiqueta: "Cupo", valor: String(cupo._sum.capacidad ?? 0) },
    ]}
    items={cursos.map((curso) => ({
      id: String(curso.id), titulo: curso.nombre,
      descripcion: [curso.categoria, curso.modalidad, curso.profesor, curso.horario].filter(Boolean).join(" · "),
      estado: curso.estado, dato: `${moneda(Number(curso.mensualidad))}/mes`,
    }))} />;
}
