import Link from "next/link";
import { listarEmbudos, getEmbudoConTarjetas } from "@/lib/services/embudos";
import { serializar } from "@/lib/serialize";
import { Board, type Columna } from "@/components/kanban/Board";
import { NuevaOportunidad } from "@/components/kanban/NuevaOportunidad";

export const dynamic = "force-dynamic";

export default async function EmbudosPage({
  searchParams
}: {
  searchParams: { embudo?: string };
}) {
  const embudos = serializar(await listarEmbudos());
  if (embudos.length === 0) {
    return <div className="p-8 text-slate-500">No hay embudos. Crea uno en Configuración.</div>;
  }

  const activoId = searchParams.embudo ?? embudos[0].id;
  const embudo = serializar(await getEmbudoConTarjetas(BigInt(activoId)));
  if (!embudo) return <div className="p-8 text-slate-500">Embudo no encontrado.</div>;

  const columnas: Columna[] = embudo.etapas.map((e: any) => ({
    id: e.id,
    nombre: e.nombre,
    color: e.color,
    tipo: e.tipo,
    tarjetas: e.oportunidades.map((o: any) => ({
      id: o.id,
      titulo: o.titulo,
      valor: Number(o.valor),
      moneda: o.moneda,
      createdAt: o.createdAt,
      conversacionId: o.contacto.conversaciones[0]?.id ?? null,
      contacto: { nombre: o.contacto.nombre, telefono: o.contacto.telefono },
      responsable: o.responsable ? { nombre: o.responsable.nombre } : null
    }))
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          {embudos.map((e: any) => (
            <Link
              key={e.id}
              href={`/embudos?embudo=${e.id}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                e.id === activoId ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {e.nombre}
            </Link>
          ))}
        </div>
        <NuevaOportunidad
          embudoId={embudo.id}
          etapas={embudo.etapas.map((e: any) => ({ id: e.id, nombre: e.nombre }))}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        <Board columnasIniciales={columnas} />
      </div>
    </div>
  );
}
