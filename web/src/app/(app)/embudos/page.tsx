import Link from "next/link";
import { listarEmbudos, getEmbudoConTarjetas } from "@/lib/services/embudos";
import { serializar } from "@/lib/serialize";
import { Board, type Columna } from "@/components/kanban/Board";
import { NuevaOportunidad } from "@/components/kanban/NuevaOportunidad";
import { aBigInt } from "@/lib/ids";
import { LIMITE_PANEL } from "@/lib/paginacion";

export const dynamic = "force-dynamic";

export default async function EmbudosPage(
  props: {
    searchParams: Promise<{ embudo?: string; nueva?: string; q?: string; pagina?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const embudos = serializar(await listarEmbudos());
  if (embudos.length === 0) {
    return (
      <div className="animate-fade-up grid h-full place-items-center p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary/10">
            <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 8v5l-4 2v-7z" /></svg>
          </div>
          <h2 className="text-base font-semibold text-primary">Aún no tienes un embudo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            El embudo es tu tablero de ventas: cada cliente avanza por etapas hasta cerrar. Créalo en un minuto.
          </p>
          <Link
            href="/configuracion"
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 hover:shadow-glow"
          >
            Crear mi embudo
          </Link>
        </div>
      </div>
    );
  }

  const activoId = searchParams.embudo ?? embudos.find((e: {nombre:string;id:string}) => e.nombre === "Comercial Ámbar Rojo")?.id ?? embudos[0].id;
  const id = aBigInt(activoId);
  if (!id) return <div className="p-8">Embudo inválido.</div>;
  const q = (searchParams.q ?? "").trim().slice(0,100);
  const pagina = Math.floor(Math.max(1, Math.min(10000, Number(searchParams.pagina) || 1)));
  const embudo = serializar(await getEmbudoConTarjetas(id, { q, pagina: Math.floor(pagina) }));
  if (!embudo) return <div className="p-8 text-muted-foreground">Embudo no encontrado.</div>;

  const columnas: Columna[] = embudo.etapas.map((e: any) => ({
    id: e.id,
    nombre: e.nombre,
    color: e.color,
    tipo: e.tipo,
    total: e._count.oportunidades,
    tarjetas: e.oportunidades.map((o: any) => ({
      id: o.id,
      titulo: o.campos?.valorAnual ? `${o.titulo} · incluye valor anual` : o.titulo,
      valor: Number(o.valor),
      moneda: o.moneda,
      createdAt: o.createdAt,
      diasEnEtapa: Math.max(0, Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 86400000)),
      conversacionId: o.contacto.conversaciones[0]?.id ?? null,
      contacto: { nombre: o.contacto.nombre, telefono: o.contacto.telefono },
      responsable: o.responsable ? { nombre: o.responsable.nombre } : null
    }))
  }));
  const total = columnas.reduce((s,c) => s+(c.total ?? 0),0);
  const mostradas = columnas.reduce((s,c) => s+c.tarjetas.length,0);
  const paginas = Math.max(1,...columnas.map(c => Math.ceil((c.total ?? 0)/LIMITE_PANEL)));
  const enlace = (n: number) => `/embudos?embudo=${activoId}&q=${encodeURIComponent(q)}&pagina=${n}`;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2" aria-label="Elegir embudo">
          {embudos.map((e: any) => (
            <Link
              key={e.id}
              href={`/embudos?embudo=${e.id}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                e.id === activoId ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {e.nombre}
            </Link>
          ))}
        </div>
        <NuevaOportunidad
          embudoId={embudo.id}
          abrirInicial={searchParams.nueva === "1"}
          etapas={embudo.etapas.map((e: any) => ({ id: e.id, nombre: e.nombre }))}
        />
      </div>
      <form className="flex flex-wrap gap-2 border-b px-4 py-3" method="get">
        <input type="hidden" name="embudo" value={activoId} />
        <input name="q" defaultValue={q} aria-label="Buscar en el embudo" placeholder="Buscar cliente u oportunidad…" className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2 text-sm" />
        <button className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">Buscar</button>
        <p className="w-full text-xs text-muted-foreground">Mostrando {mostradas} de {total} oportunidades · hasta {LIMITE_PANEL} por columna y página. Incluye ganados y perdidos.</p>
        {paginas > 1 && <nav className="flex gap-3 text-sm" aria-label="Páginas del embudo">{pagina > 1 && <Link href={enlace(pagina-1)}>Anterior</Link>}<span>Página {pagina} de {paginas}</span>{pagina < paginas && <Link href={enlace(pagina+1)}>Siguiente</Link>}</nav>}
      </form>

      <div className="flex-1 overflow-hidden">
        <Board key={`${activoId}:${q}:${pagina}`} columnasIniciales={columnas} />
      </div>
    </div>
  );
}
