import { redirect } from "next/navigation";
import { PanelLegal } from "@/components/legal/PanelLegal";
import { db } from "@/lib/db";
import { esPasante } from "@/lib/legal";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { getSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LegalPage() {
  const sesion = await getSesion();
  if (!sesion?.user?.id) redirect("/login");
  if (!(await moduloActivo("legal"))) redirect("/");
  const filtro = esPasante(sesion.user.puesto, sesion.user.rol)
    ? { responsableId: BigInt(sesion.user.id) }
    : {};
  const [expedientes, total, activos, suspendidos, materias] = await Promise.all([
    db.expedienteLegal.findMany({
      where: filtro,
      include: { contacto: true, responsable: true },
      orderBy: { updatedAt: "desc" },
      take: LIMITE_PANEL,
    }),
    db.expedienteLegal.count({ where: filtro }),
    db.expedienteLegal.count({ where: { ...filtro, estado: "activo" } }),
    db.expedienteLegal.count({ where: { ...filtro, estado: "suspendido" } }),
    db.expedienteLegal.groupBy({ by: ["materia"], where: { ...filtro, materia: { not: null } } }),
  ]);
  return (
    <PanelLegal
      titulo="Expedientes legales"
      descripcion="Asuntos, responsables, etapas procesales y actividad del despacho."
      metricas={[
        { etiqueta: "Expedientes", valor: String(total) },
        { etiqueta: "Activos", valor: String(activos) },
        { etiqueta: "Suspendidos", valor: String(suspendidos) },
        { etiqueta: "Materias", valor: String(materias.length) },
      ]}
      filas={expedientes.map((item) => ({
        id: String(item.id),
        titulo: item.numeroInterno || item.numeroJudicial || `Expediente ${item.id}`,
        subtitulo: [item.contacto?.nombre, item.materia, item.etapaProcesal, item.responsable?.nombre]
          .filter(Boolean)
          .join(" · "),
        estado: item.estado,
        fecha: item.fechaInicio?.toLocaleDateString("es-MX") ?? null,
        href: `/legal/${item.id}`,
      }))}
    />
  );
}
