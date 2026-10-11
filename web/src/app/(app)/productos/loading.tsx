import { Esqueleto, EsqueletoAcciones, EsqueletoEncabezado, EsqueletoFiltros, EsqueletoMetricas, EsqueletoTabla } from "@/components/Esqueletos";

export default function Loading() {
  return (
    <Esqueleto>
      <EsqueletoEncabezado accion={false} />
      <EsqueletoAcciones cantidad={8} />
      <EsqueletoMetricas />
      <EsqueletoFiltros />
      <EsqueletoTabla filas={6} columnas={6} />
    </Esqueleto>
  );
}
