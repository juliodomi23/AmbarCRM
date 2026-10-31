import Link from "next/link";

export function LinkModuloTaller({ contactoId }: { contactoId: string }) {
  return <div className="mx-auto max-w-6xl px-6 pt-4"><Link className="inline-flex rounded-lg border px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50" href={`/taller?contactoId=${encodeURIComponent(contactoId)}`}>Registrar vehículo de este cliente</Link></div>;
}
