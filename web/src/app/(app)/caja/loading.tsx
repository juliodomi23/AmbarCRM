import { Bloque, Esqueleto, EsqueletoEncabezado, EsqueletoTabla } from "@/components/Esqueletos";

export default function Loading() {
  return (
    <Esqueleto className="mx-auto max-w-3xl p-4 md:p-6">
      <EsqueletoEncabezado />
      <div className="surface space-y-4 p-5">
        <Bloque className="h-4 w-16" />
        <Bloque className="h-10 w-full rounded-lg" />
        <Bloque className="h-9 w-32 rounded-lg" />
      </div>
      <EsqueletoTabla filas={3} columnas={6} />
    </Esqueleto>
  );
}
