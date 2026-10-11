import { Esqueleto, EsqueletoEncabezado, EsqueletoLista, EsqueletoMetricas } from "@/components/Esqueletos";

export default function Loading() {
  return (
    <Esqueleto className="mx-auto max-w-4xl p-4 md:p-6">
      <EsqueletoEncabezado />
      <EsqueletoMetricas cantidad={3} />
      <EsqueletoLista filas={5} />
    </Esqueleto>
  );
}
