import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";

export const dynamic = "force-dynamic";

export default async function ToursPage() {
  if (!(await moduloActivo("tours"))) redirect("/");
  const tours = await db.tour.findMany({
    include: { reservas: true },
    orderBy: [{ fechaSalida: "asc" }, { nombre: "asc" }],
  });
  const vendidos = tours.reduce(
    (total, tour) => total + tour.reservas.reduce((suma, reserva) => suma + reserva.viajeros, 0),
    0,
  );
  return <PanelListado titulo="Tours y salidas" descripcion="Experiencias, itinerarios, fechas, precios y cupo."
    metricas={[
      { etiqueta: "Experiencias", valor: String(tours.length) },
      { etiqueta: "Publicadas", valor: String(tours.filter((tour) => tour.estado === "publicado").length) },
      { etiqueta: "Viajeros", valor: String(vendidos) },
      { etiqueta: "Cupo total", valor: String(tours.reduce((suma, tour) => suma + tour.capacidad, 0)) },
    ]}
    items={tours.map((tour) => ({
      id: String(tour.id), titulo: tour.nombre,
      descripcion: [tour.destino, tour.pais, `${tour.duracionDias} días`, tour.fechaSalida?.toLocaleDateString("es-MX")]
        .filter(Boolean).join(" · "),
      estado: tour.estado,
      dato: Number(tour.precio).toLocaleString("es-MX", { style: "currency", currency: tour.moneda }),
    }))} />;
}
