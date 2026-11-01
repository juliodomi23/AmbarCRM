export default function TallerLoading() {
  return <div aria-label="Cargando taller" className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <div className="space-y-5"><div className="space-y-2"><div className="skeleton h-3 w-32"/><div className="skeleton h-9 w-64"/><div className="skeleton h-4 w-80 max-w-full"/></div><div className="flex gap-2 border-b border-border/70 pb-2">{[1,2,3,4].map((n) => <div className="skeleton h-11 w-28 shrink-0 rounded-lg" key={n}/>)}</div></div>
    <div className="surface grid gap-4 p-4 sm:grid-cols-3">{[1,2,3].map((n) => <div className="skeleton h-12" key={n}/>)}</div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1,2,3,4,5,6].map((n) => <div className="surface space-y-4 p-5" key={n}><div className="skeleton h-9 w-36"/><div className="skeleton h-6 w-48"/><div className="skeleton h-4 w-full"/><div className="skeleton h-4 w-2/3"/></div>)}</div>
  </div>;
}
