import Link from "next/link";
import { TallerIcono } from "@/components/taller/TallerIcono";

export function LinkModuloTaller({ contactoId }: { contactoId: string }) {
  return <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6"><Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-primary shadow-soft transition hover:bg-primary/5" href={`/taller?contactoId=${encodeURIComponent(contactoId)}`}><TallerIcono nombre="vehiculo" className="h-4 w-4" />Registrar vehículo de este cliente</Link></div>;
}
