import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";

export const dynamic = "force-dynamic";

export default async function ColegiaturasPage() {
  if (!(await moduloActivo("colegiaturas"))) redirect("/");
  const colegiaturas = await db.colegiaturaAcademia.findMany({
    include: { alumno: { include: { contacto: true } } }, orderBy: { vencimiento: "asc" },
  });
  const moneda = (valor: number) => valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  const pendientes = colegiaturas.filter((item) => item.estado !== "pagada");
  return <PanelListado titulo="Colegiaturas" descripcion="Cargos, vencimientos, pagos y cartera pendiente."
    metricas={[
      { etiqueta: "Cargos", valor: String(colegiaturas.length) },
      { etiqueta: "Pendientes", valor: String(pendientes.length) },
      { etiqueta: "Por cobrar", valor: moneda(pendientes.reduce((suma, item) => suma + Number(item.monto), 0)) },
      { etiqueta: "Pagadas", valor: String(colegiaturas.filter((item) => item.estado === "pagada").length) },
    ]}
    items={colegiaturas.map((item) => ({
      id: String(item.id), titulo: `${item.concepto} · ${item.alumno.contacto.nombre}`,
      descripcion: `${item.periodo ?? "Sin periodo"} · Vence ${item.vencimiento.toLocaleDateString("es-MX")}`,
      estado: item.estado, dato: moneda(Number(item.monto)),
    }))} />;
}
