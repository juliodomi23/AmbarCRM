export default function LoadingTallerAprobacion() {
  return <main className="min-h-svh bg-background px-4 py-6 sm:px-6 sm:py-10">
    <section aria-label="Cargando aprobación" className="surface mx-auto max-w-lg space-y-5 p-5 sm:p-7">
      <div className="flex items-center gap-3"><div className="skeleton h-12 w-12 rounded-xl" /><div className="space-y-2"><div className="skeleton h-3 w-28" /><div className="skeleton h-5 w-36" /></div></div>
      <div className="skeleton h-32 w-full rounded-xl" />
      <div className="space-y-3"><div className="skeleton h-12 w-full" /><div className="skeleton h-12 w-full" /></div>
      <div className="skeleton ml-auto h-12 w-44" />
      <div className="skeleton h-12 w-full rounded-lg" />
    </section>
  </main>;
}
