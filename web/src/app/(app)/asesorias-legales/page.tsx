import { redirect } from "next/navigation";
import { PanelLegal } from "@/components/legal/PanelLegal";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";

export const dynamic = "force-dynamic";

export default async function AsesoriasLegalesPage() {
  if (!(await moduloActivo("asesorias_legales"))) redirect("/");
  const asesorias = await db.asesoriaLegal.findMany({
    include: { contacto: true, abogado: true },
    orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
  });
  const contratos = asesorias.filter((item) => item.estado === "contrato_firmado").length;
  return <PanelLegal titulo="Asesorías legales" descripcion="Consultas y conversión a nuevos asuntos."
    metricas={[
      { etiqueta: "Asesorías", valor: String(asesorias.length) },
      { etiqueta: "Pendientes", valor: String(asesorias.filter((item) => item.estado === "pendiente").length) },
      { etiqueta: "Contratos", valor: String(contratos) },
      { etiqueta: "Conversión", valor: asesorias.length ? `${Math.round(contratos / asesorias.length * 100)}%` : "0%" },
    ]}
    filas={asesorias.map((item) => ({
      id: String(item.id), titulo: item.tema || item.contacto?.nombre || `Asesoría ${item.id}`,
      subtitulo: [item.contacto?.nombre, item.abogado?.nombre, item.origen].filter(Boolean).join(" · "),
      estado: item.estado, fecha: item.fecha?.toLocaleDateString("es-MX") ?? null,
    }))} />;
}
