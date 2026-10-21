import { Bloque, Esqueleto } from "@/components/Esqueletos";

export function CargaCampanas() {
  return <Esqueleto className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {[1, 2, 3].map((numero) => <div key={numero} className="surface space-y-4 p-5"><Bloque className="h-5 w-24" /><Bloque className="h-6 w-3/4" /><Bloque className="h-16 w-full" /><Bloque className="h-11 w-full" /></div>)}
  </Esqueleto>;
}
