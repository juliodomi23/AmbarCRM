import { redirect } from "next/navigation";
import { PanelLegal } from "@/components/legal/PanelLegal";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";

export const dynamic = "force-dynamic";

export default async function FinanzasLegalesPage() {
  if (!(await moduloActivo("finanzas_legales"))) redirect("/");
  const movimientos = await db.movimientoLegal.findMany({
    include: { contacto: true, expediente: true }, orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
  });
  const total = (tipo: string) => movimientos.filter((item) => item.tipo === tipo)
    .reduce((suma, item) => suma + Number(item.monto), 0);
  const moneda = (valor: number) => valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  return <PanelLegal titulo="Honorarios y caja" descripcion="Planes, cobros, gastos, caja y diligencias."
    metricas={[
      { etiqueta: "Movimientos", valor: String(movimientos.length) },
      { etiqueta: "Cobrado", valor: moneda(total("pago")) },
      { etiqueta: "Planes", valor: String(movimientos.filter((item) => item.tipo === "plan_pago").length) },
      { etiqueta: "Gastos", valor: moneda(total("gasto") + total("diligencia")) },
    ]}
    filas={movimientos.map((item) => ({
      id: String(item.id), titulo: item.concepto,
      subtitulo: [item.contacto?.nombre, item.expediente?.numeroInterno, item.tipo].filter(Boolean).join(" · "),
      estado: item.estado || item.tipo, fecha: item.fecha?.toLocaleDateString("es-MX") ?? null,
      importe: Number(item.monto),
    }))} />;
}
