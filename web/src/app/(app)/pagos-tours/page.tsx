import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";

export const dynamic = "force-dynamic";

export default async function PagosToursPage() {
  if (!(await moduloActivo("pagos_tours"))) redirect("/");
  const [pagos, totales, aplicados, metodos] = await Promise.all([
    db.pagoTour.findMany({
      include: { reserva: { include: { contacto: true, tour: true } } },
      orderBy: { fecha: "desc" },
      take: LIMITE_PANEL,
    }),
    db.pagoTour.aggregate({ _count: { _all: true }, _sum: { monto: true } }),
    db.pagoTour.count({ where: { estado: "aplicado" } }),
    db.pagoTour.groupBy({ by: ["metodo"], where: { metodo: { not: null } } }),
  ]);
  const moneda = (valor: number) => valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  return <PanelListado titulo="Cobranza de viajes" descripcion="Anticipos y liquidaciones de las reservas."
    metricas={[
      { etiqueta: "Movimientos", valor: String(totales._count._all) },
      { etiqueta: "Cobrado", valor: moneda(Number(totales._sum.monto ?? 0)) },
      { etiqueta: "Aplicados", valor: String(aplicados) },
      { etiqueta: "Métodos", valor: String(metodos.length) },
    ]}
    items={pagos.map((pago) => ({
      id: String(pago.id), titulo: `${pago.concepto} · ${pago.reserva.contacto.nombre}`,
      descripcion: `${pago.reserva.codigo} · ${pago.reserva.tour.nombre} · ${pago.metodo ?? "Sin método"}`,
      estado: pago.estado, dato: moneda(Number(pago.monto)),
    }))} />;
}
