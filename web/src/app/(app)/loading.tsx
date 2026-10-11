import { Esqueleto, EsqueletoEncabezado, EsqueletoMetricas, EsqueletoPanel } from "@/components/Esqueletos";

// Inicio (y cualquier ruta sin esqueleto propio): encabezado, métricas y dos paneles.
export default function Loading() {
  return (
    <Esqueleto className="p-4 md:p-6">
      <EsqueletoEncabezado accion={false} />
      <EsqueletoMetricas />
      <div className="grid gap-4 lg:grid-cols-2">
        <EsqueletoPanel alto="h-64" />
        <EsqueletoPanel alto="h-64" />
      </div>
    </Esqueleto>
  );
}
