import { Esqueleto, EsqueletoEncabezado, EsqueletoMetricas, EsqueletoPanel } from "@/components/Esqueletos";

export default function Loading() {
  return (
    <Esqueleto>
      <EsqueletoEncabezado />
      <EsqueletoMetricas />
      <div className="grid gap-4 lg:grid-cols-2">
        <EsqueletoPanel alto="h-64" />
        <EsqueletoPanel alto="h-64" />
      </div>
    </Esqueleto>
  );
}
