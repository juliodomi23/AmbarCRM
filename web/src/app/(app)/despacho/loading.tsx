export default function DespachoLoading() {
  return <div aria-label="Cargando despacho" className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
    <div className="space-y-5"><div className="space-y-2"><div className="skeleton h-3 w-32"/><div className="skeleton h-9 w-64"/><div className="skeleton h-4 w-80 max-w-full"/></div><div className="flex gap-2 border-b border-border/70 pb-2">{[1,2,3,4,5].map((n) => <div className="skeleton h-11 w-28 shrink-0 rounded-lg" key={n}/>)}</div></div>
    <div className="grid gap-3 lg:grid-cols-[minmax(260px,340px)_1fr]"><div className="surface flex min-h-48 items-center gap-5 p-5"><div className="skeleton h-32 w-32 shrink-0 rounded-full"/><div className="space-y-3"><div className="skeleton h-4 w-36"/><div className="skeleton h-7 w-28"/></div></div><div className="grid gap-3 sm:grid-cols-3">{[1,2,3].map((n) => <div className="surface space-y-3 p-5" key={n}><div className="skeleton h-4 w-28"/><div className="skeleton h-9 w-14"/></div>)}</div></div>
    <div className="grid gap-4 lg:grid-cols-2">{[1,2].map((n) => <div className="surface space-y-4 p-5" key={n}><div className="skeleton h-6 w-40"/><div className="skeleton h-4 w-full"/><div className="skeleton h-4 w-3/4"/><div className="skeleton h-4 w-2/3"/></div>)}</div>
  </div>;
}
