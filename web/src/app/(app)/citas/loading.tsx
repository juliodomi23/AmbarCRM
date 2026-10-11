import { Bloque, Esqueleto, EsqueletoEncabezado } from "@/components/Esqueletos";

export default function Loading() {
  return (
    <Esqueleto>
      <EsqueletoEncabezado />
      <div className="flex gap-2">
        <Bloque className="h-9 w-20 rounded-lg" />
        <Bloque className="h-9 w-20 rounded-lg" />
        <Bloque className="h-9 w-32 rounded-lg" />
      </div>
      <div className="surface space-y-3 p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bloque className="h-4 w-14 shrink-0" />
            <Bloque className="h-14 flex-1 rounded-lg" />
          </div>
        ))}
      </div>
    </Esqueleto>
  );
}
