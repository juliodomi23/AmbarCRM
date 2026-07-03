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
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-navy/10">
            <svg className="h-6 w-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 8v5l-4 2v-7z" /></svg>
          </div>
          <h2 className="text-base font-semibold text-navy">Aún no tienes un embudo</h2>
          <p className="mt-1 text-sm text-slate-500">
            El embudo es tu tablero de ventas: cada cliente avanza por etapas hasta cerrar. Créalo en un minuto.
          </p>
          <Link
            href="/configuracion"
            className="mt-4 inline-block rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-navy/90"
          >
            Crear mi embudo
          </Link>
        </div>
      </div>
    );
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
