export default function ContenidoLoading() {
  return <div aria-label="Cargando contenido" className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
    <div className="space-y-5"><div className="space-y-2"><div className="skeleton h-3 w-32"/><div className="skeleton h-9 w-64"/><div className="skeleton h-4 w-80 max-w-full"/></div><div className="flex gap-2 border-b border-border/70 pb-2">{[1,2,3,4].map((n) => <div className="skeleton h-11 w-28 shrink-0 rounded-lg" key={n}/>)}</div></div>
    <div className="surface flex min-h-16 flex-wrap items-center gap-3 p-4"><div className="skeleton h-10 w-40"/><div className="skeleton h-10 w-28"/><div className="skeleton h-10 w-32"/><div className="skeleton h-8 w-28 rounded-full"/><div className="skeleton h-8 w-28 rounded-full"/></div>
    <div className="grid gap-3 xl:grid-cols-7">{[1,2,3,4,5,6,7].map((n) => <div className="space-y-2 rounded-xl p-2 md:grid md:grid-cols-[140px_minmax(0,1fr)] xl:block xl:p-0" key={n}><div className="skeleton h-10 w-28"/><div className="surface space-y-3 p-3"><div className="skeleton h-5 w-3/4"/><div className="skeleton h-4 w-full"/><div className="skeleton h-7 w-24"/></div></div>)}</div>
  </div>;
}
