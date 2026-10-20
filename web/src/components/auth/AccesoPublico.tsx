import Link from "next/link";

export function AccesoPublico({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen grid place-items-center bg-mesh bg-background px-4">
      <section className="surface w-full max-w-sm space-y-5 rounded-2xl p-6 sm:p-8">
        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold text-primary">AmbarCRM</p>
          <h1 className="text-2xl font-bold">{titulo}</h1>
        </div>
        {children}
        <Link href="/login" className="block text-center text-sm text-primary hover:underline">Volver al inicio de sesión</Link>
      </section>
    </main>
  );
}
