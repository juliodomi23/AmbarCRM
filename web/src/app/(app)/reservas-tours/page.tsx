import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { hoyMexico, LIMITE_OPCIONES, OPCIONES, opcionesDe } from "@/lib/opciones-formularios";

export const dynamic = "force-dynamic";

export default async function ReservasToursPage() {
  if (!(await moduloActivo("reservas_tours"))) redirect("/");
  const [reservas, totales, confirmadas] = await Promise.all([
    db.reservaTour.findMany({
      include: { contacto: true, tour: true }, orderBy: { createdAt: "desc" }, take: LIMITE_PANEL,
    }),
    db.reservaTour.aggregate({ _count: { _all: true }, _sum: { viajeros: true, saldo: true } }),
    db.reservaTour.count({ where: { estado: "confirmada" } }),
  ]);
  const moneda = (valor: number) => valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  const toursAbiertos = await db.tour.findMany({
    where: { estado: { not: "cerrado" } }, orderBy: [{ fechaSalida: "asc" }, { nombre: "asc" }], take: LIMITE_OPCIONES,
  });
  return <PanelListado titulo="Reservas y viajeros" descripcion="Apartados, pasajeros, salidas y saldos."
    acciones={<FormularioModulo boton="+ Nueva reserva" titulo="Nueva reserva" endpoint="/api/viajes/reservas"
      campos={[
        { nombre: "contactoId", etiqueta: "Viajero (contacto)", tipo: "contacto", requerido: true },
        { nombre: "tourId", etiqueta: "Tour", tipo: "seleccion", requerido: true, opciones: opcionesDe(toursAbiertos, (t) => `${t.nombre}${t.fechaSalida ? ` · ${t.fechaSalida.toLocaleDateString("es-MX")}` : ""}`, "Elige un tour") },
        { nombre: "viajeros", etiqueta: "Número de viajeros", tipo: "numero", requerido: true, valorInicial: "1" },
        { nombre: "total", etiqueta: "Total", tipo: "dinero", requerido: true },
        { nombre: "saldo", etiqueta: "Saldo pendiente", tipo: "dinero", ayuda: "Vacío = igual al total" },
        { nombre: "estado", etiqueta: "Estado", tipo: "seleccion", opciones: OPCIONES.estadoReserva },
        { nombre: "notas", etiqueta: "Notas", tipo: "textarea" },
      ]} />}
    metricas={[
      { etiqueta: "Reservas", valor: String(totales._count._all) },
      { etiqueta: "Confirmadas", valor: String(confirmadas) },
      { etiqueta: "Viajeros", valor: String(totales._sum.viajeros ?? 0) },
      { etiqueta: "Saldo pendiente", valor: moneda(Number(totales._sum.saldo ?? 0)) },
    ]}
    items={reservas.map((reserva) => ({
      id: String(reserva.id), titulo: `${reserva.codigo} · ${reserva.contacto.nombre}`,
      descripcion: `${reserva.tour.nombre} · ${reserva.viajeros} viajero(s)`,
      estado: reserva.estado, dato: moneda(Number(reserva.saldo)),
    }))} />;
}
