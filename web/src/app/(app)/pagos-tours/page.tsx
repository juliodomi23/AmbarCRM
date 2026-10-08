import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";

export const dynamic = "force-dynamic";

export default async function PagosToursPage() {
  if (!(await moduloActivo("pagos_tours"))) redirect("/");
  const pagos = await db.pagoTour.findMany({
    include: { reserva: { include: { contacto: true, tour: true } } },
    orderBy: { fecha: "desc" },
  });
  const moneda = (valor: number) => valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  return <PanelListado titulo="Cobranza de viajes" descripcion="Anticipos y liquidaciones de las reservas."
    metricas={[
      { etiqueta: "Movimientos", valor: String(pagos.length) },
      { etiqueta: "Cobrado", valor: moneda(pagos.reduce((suma, pago) => suma + Number(pago.monto), 0)) },
      { etiqueta: "Aplicados", valor: String(pagos.filter((pago) => pago.estado === "aplicado").length) },
      { etiqueta: "Métodos", valor: String(new Set(pagos.map((pago) => pago.metodo).filter(Boolean)).size) },
    ]}
    items={pagos.map((pago) => ({
      id: String(pago.id), titulo: `${pago.concepto} · ${pago.reserva.contacto.nombre}`,
      descripcion: `${pago.reserva.codigo} · ${pago.reserva.tour.nombre} · ${pago.metodo ?? "Sin método"}`,
      estado: pago.estado, dato: moneda(Number(pago.monto)),
    }))} />;
}
