"use client";
import { useRouter, useSearchParams } from "next/navigation";

export function MostrarBajas({ activo }: {activo:boolean}) {
  const router = useRouter();
  const actuales = useSearchParams();
  return <label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm"><input type="checkbox" checked={activo} onChange={e => { const p = new URLSearchParams(actuales.toString()); if(e.target.checked)p.set("bajas","1");else p.delete("bajas");p.delete("pagina");router.push(`/contratos?${p}`); }} className="h-4 w-4 accent-primary" />Mostrar bajas</label>;
}
