import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";

export const dynamic = "force-dynamic";

export default async function ReservasToursPage() {
  if (!(await moduloActivo("reservas_tours"))) redirect("/");
  const reservas = await db.reservaTour.findMany({
    include: { contacto: true, tour: true }, orderBy: { createdAt: "desc" },
  });
  const moneda = (valor: number) => valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  return <PanelListado titulo="Reservas y viajeros" descripcion="Apartados, pasajeros, salidas y saldos."
    metricas={[
      { etiqueta: "Reservas", valor: String(reservas.length) },
      { etiqueta: "Confirmadas", valor: String(reservas.filter((item) => item.estado === "confirmada").length) },
      { etiqueta: "Viajeros", valor: String(reservas.reduce((suma, item) => suma + item.viajeros, 0)) },
      { etiqueta: "Saldo pendiente", valor: moneda(reservas.reduce((suma, item) => suma + Number(item.saldo), 0)) },
    ]}
    items={reservas.map((reserva) => ({
      id: String(reserva.id), titulo: `${reserva.codigo} · ${reserva.contacto.nombre}`,
      descripcion: `${reserva.tour.nombre} · ${reserva.viajeros} viajero(s)`,
      estado: reserva.estado, dato: moneda(Number(reserva.saldo)),
    }))} />;
}
