import Link from "next/link";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  const business = process.env.LEGAL_BUSINESS_NAME || "Ámbar Rojo Studios";
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-700">
      <article className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="border-b border-slate-100 pb-5">
          <Link href="/login" className="text-sm font-semibold text-navy">{business}</Link>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">Última actualización: {updated}</p>
        </div>
        <div className="space-y-5 leading-7">{children}</div>
        <nav className="flex flex-wrap gap-4 border-t border-slate-100 pt-5 text-sm text-navy">
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/terminos">Términos</Link>
          <Link href="/eliminacion-datos">Eliminación de datos</Link>
        </nav>
      </article>
    </main>
  );
}
