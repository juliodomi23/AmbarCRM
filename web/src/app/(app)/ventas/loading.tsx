import { Esqueleto, EsqueletoEncabezado, EsqueletoFiltros, EsqueletoMetricas, EsqueletoTarjetas } from "@/components/Esqueletos";

export default function Loading() {
  return (
    <Esqueleto>
      <EsqueletoEncabezado />
      <EsqueletoMetricas />
      <EsqueletoFiltros />
      <EsqueletoTarjetas />
    </Esqueleto>
  );
}
