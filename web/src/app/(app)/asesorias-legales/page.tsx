import { redirect } from "next/navigation";
import { PanelLegal } from "@/components/legal/PanelLegal";
import { db } from "@/lib/db";
import { esPasante } from "@/lib/legal";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { getSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AsesoriasLegalesPage() {
  const sesion = await getSesion();
  if (!sesion?.user?.id) redirect("/login");
  if (!(await moduloActivo("asesorias_legales"))) redirect("/");
  const filtro = esPasante(sesion.user.puesto, sesion.user.rol)
    ? { abogadoId: BigInt(sesion.user.id) }
    : {};
  const [asesorias, total, pendientes, contratos] = await Promise.all([
    db.asesoriaLegal.findMany({
      where: filtro,
      include: { contacto: true, abogado: true },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      take: LIMITE_PANEL,
    }),
    db.asesoriaLegal.count({ where: filtro }),
    db.asesoriaLegal.count({ where: { ...filtro, estado: "pendiente" } }),
    db.asesoriaLegal.count({ where: { ...filtro, estado: "contrato_firmado" } }),
  ]);
  return <PanelLegal titulo="Asesorías legales" descripcion="Consultas y conversión a nuevos asuntos."
    metricas={[
      { etiqueta: "Asesorías", valor: String(total) },
      { etiqueta: "Pendientes", valor: String(pendientes) },
      { etiqueta: "Contratos", valor: String(contratos) },
      { etiqueta: "Conversión", valor: total ? `${Math.round(contratos / total * 100)}%` : "0%" },
    ]}
    filas={asesorias.map((item) => ({
      id: String(item.id), titulo: item.tema || item.contacto?.nombre || `Asesoría ${item.id}`,
      subtitulo: [item.contacto?.nombre, item.abogado?.nombre, item.origen].filter(Boolean).join(" · "),
      estado: item.estado, fecha: item.fecha?.toLocaleDateString("es-MX") ?? null,
    }))} />;
}
