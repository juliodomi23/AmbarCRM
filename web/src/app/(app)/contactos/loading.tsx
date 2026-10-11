import { Esqueleto, EsqueletoEncabezado, EsqueletoFiltros, EsqueletoTabla } from "@/components/Esqueletos";

export default function Loading() {
  return (
    <Esqueleto>
      <EsqueletoEncabezado />
      <EsqueletoFiltros />
      <EsqueletoTabla filas={8} columnas={5} />
    </Esqueleto>
  );
}
