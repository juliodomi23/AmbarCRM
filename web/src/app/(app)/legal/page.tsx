import { redirect } from "next/navigation";
import { PanelLegal } from "@/components/legal/PanelLegal";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";

export const dynamic = "force-dynamic";

export default async function LegalPage() {
  if (!(await moduloActivo("legal"))) redirect("/");
  const expedientes = await db.expedienteLegal.findMany({
    include: { contacto: true, responsable: true },
    orderBy: { updatedAt: "desc" },
  });
  const activos = expedientes.filter((item) => item.estado === "activo").length;
  return (
    <PanelLegal
      titulo="Expedientes legales"
      descripcion="Asuntos, responsables, etapas procesales y actividad del despacho."
      metricas={[
        { etiqueta: "Expedientes", valor: String(expedientes.length) },
        { etiqueta: "Activos", valor: String(activos) },
        { etiqueta: "Suspendidos", valor: String(expedientes.filter((item) => item.estado === "suspendido").length) },
        { etiqueta: "Materias", valor: String(new Set(expedientes.map((item) => item.materia).filter(Boolean)).size) },
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
