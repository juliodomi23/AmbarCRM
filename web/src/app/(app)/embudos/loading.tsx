import { Bloque, Esqueleto, EsqueletoEncabezado, EsqueletoKanban } from "@/components/Esqueletos";

export default function Loading() {
  return (
    <Esqueleto>
      <EsqueletoEncabezado />
      <div className="flex gap-2">
        <Bloque className="h-8 w-24 rounded-full" />
        <Bloque className="h-8 w-24 rounded-full" />
      </div>
      <EsqueletoKanban />
    </Esqueleto>
  );
}
