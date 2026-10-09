import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { camposTour, fechaCampo, textoCampo } from "@/lib/campos-modulos";

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
    acciones={<FormularioModulo boton="+ Nuevo tour" titulo="Nuevo tour" endpoint="/api/viajes/tours"
      campos={camposTour()} />}
    edicion={{ titulo: "Editar tour", campos: camposTour(), eliminar: "Borrar tour" }}
    metricas={[
      { etiqueta: "Experiencias", valor: String(total) },
      { etiqueta: "Publicadas", valor: String(publicadas) },
      { etiqueta: "Viajeros", valor: String(viajeros._sum.viajeros ?? 0) },
      { etiqueta: "Cupo total", valor: String(cupo._sum.capacidad ?? 0) },
    ]}
    items={tours.map((tour) => ({
      id: String(tour.id), edicion: { endpoint: `/api/viajes/tours/${tour.id}`, valores: { nombre: textoCampo(tour.nombre), destino: textoCampo(tour.destino), pais: textoCampo(tour.pais), fechaSalida: fechaCampo(tour.fechaSalida), fechaRegreso: fechaCampo(tour.fechaRegreso), duracionDias: textoCampo(tour.duracionDias), capacidad: textoCampo(tour.capacidad), precio: textoCampo(tour.precio), puntoEncuentro: textoCampo(tour.puntoEncuentro), incluye: textoCampo(tour.incluye), estado: textoCampo(tour.estado) } }, titulo: tour.nombre,
      descripcion: [tour.destino, tour.pais, `${tour.duracionDias} días`, tour.fechaSalida?.toLocaleDateString("es-MX")]
        .filter(Boolean).join(" · "),
      estado: tour.estado,
      dato: Number(tour.precio).toLocaleString("es-MX", { style: "currency", currency: tour.moneda }),
    }))} />;
}
