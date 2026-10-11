import { Esqueleto, EsqueletoEncabezado, EsqueletoFiltros, EsqueletoTabla } from "@/components/Esqueletos";

export default function Loading() {
  return (
    <Esqueleto>
      <EsqueletoEncabezado />
      <EsqueletoFiltros />
      <EsqueletoTabla filas={6} columnas={5} />
    </Esqueleto>
  );
}
