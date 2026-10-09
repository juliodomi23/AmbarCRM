import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { LIMITE_OPCIONES, opcionesDe } from "@/lib/opciones-formularios";
import { camposReserva, camposReservaEdicion, fechaCampo, textoCampo } from "@/lib/campos-modulos";

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
      campos={camposReserva(opcionesDe(toursAbiertos, (t) => `${t.nombre}${t.fechaSalida ? ` · ${t.fechaSalida.toLocaleDateString("es-MX")}` : ""}`, "Elige un tour"))} />}
    edicion={{ titulo: "Editar reserva", campos: camposReservaEdicion(), eliminar: "Borrar reserva" }}
    metricas={[
      { etiqueta: "Reservas", valor: String(totales._count._all) },
      { etiqueta: "Confirmadas", valor: String(confirmadas) },
      { etiqueta: "Viajeros", valor: String(totales._sum.viajeros ?? 0) },
      { etiqueta: "Saldo pendiente", valor: moneda(Number(totales._sum.saldo ?? 0)) },
    ]}
    items={reservas.map((reserva) => ({
      id: String(reserva.id), edicion: { endpoint: `/api/viajes/reservas/${reserva.id}`, valores: { estado: textoCampo(reserva.estado), viajeros: textoCampo(reserva.viajeros), total: textoCampo(reserva.total), fechaSalida: fechaCampo(reserva.fechaSalida), notas: textoCampo(reserva.notas) } }, titulo: `${reserva.codigo} · ${reserva.contacto.nombre}`,
      descripcion: `${reserva.tour.nombre} · ${reserva.viajeros} viajero(s)`,
      estado: reserva.estado, dato: moneda(Number(reserva.saldo)),
    }))} />;
}
