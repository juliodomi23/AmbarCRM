import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";

export const dynamic = "force-dynamic";

export default async function ToursPage() {
  if (!(await moduloActivo("tours"))) redirect("/");
  const [tours, total, publicadas, viajeros, cupo] = await Promise.all([
    db.tour.findMany({
      orderBy: [{ fechaSalida: "asc" }, { nombre: "asc" }],
      take: LIMITE_PANEL,
    }),
    db.tour.count(),
    db.tour.count({ where: { estado: "publicado" } }),
    db.reservaTour.aggregate({ _sum: { viajeros: true } }),
    db.tour.aggregate({ _sum: { capacidad: true } }),
  ]);
  return <PanelListado titulo="Tours y salidas" descripcion="Experiencias, itinerarios, fechas, precios y cupo."
    metricas={[
      { etiqueta: "Experiencias", valor: String(total) },
      { etiqueta: "Publicadas", valor: String(publicadas) },
      { etiqueta: "Viajeros", valor: String(viajeros._sum.viajeros ?? 0) },
      { etiqueta: "Cupo total", valor: String(cupo._sum.capacidad ?? 0) },
    ]}
    items={tours.map((tour) => ({
      id: String(tour.id), titulo: tour.nombre,
      descripcion: [tour.destino, tour.pais, `${tour.duracionDias} días`, tour.fechaSalida?.toLocaleDateString("es-MX")]
        .filter(Boolean).join(" · "),
      estado: tour.estado,
      dato: Number(tour.precio).toLocaleString("es-MX", { style: "currency", currency: tour.moneda }),
    }))} />;
}
