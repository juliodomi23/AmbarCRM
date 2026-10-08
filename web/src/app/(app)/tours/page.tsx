import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { hoyMexico, LIMITE_OPCIONES, OPCIONES, opcionesDe } from "@/lib/opciones-formularios";

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
      campos={[
        { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true },
        { nombre: "destino", etiqueta: "Destino", tipo: "texto", requerido: true },
        { nombre: "pais", etiqueta: "País", tipo: "texto" },
        { nombre: "fechaSalida", etiqueta: "Fecha de salida", tipo: "fecha" },
        { nombre: "fechaRegreso", etiqueta: "Fecha de regreso", tipo: "fecha" },
        { nombre: "duracionDias", etiqueta: "Duración (días)", tipo: "numero", valorInicial: "1" },
        { nombre: "capacidad", etiqueta: "Cupo (personas)", tipo: "numero", requerido: true },
        { nombre: "precio", etiqueta: "Precio por persona", tipo: "dinero", requerido: true },
        { nombre: "puntoEncuentro", etiqueta: "Punto de encuentro", tipo: "texto" },
        { nombre: "incluye", etiqueta: "Incluye", tipo: "textarea" },
        { nombre: "estado", etiqueta: "Estado", tipo: "seleccion", opciones: OPCIONES.estadoTour },
      ]} />}
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
