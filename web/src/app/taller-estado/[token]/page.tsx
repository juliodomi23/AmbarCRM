import { notFound } from "next/navigation";
import { TallerEstadoPublico } from "@/components/taller/TallerEstadoPublico";
import { cargarEstadoPublico } from "@/lib/taller-estado";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Seguimiento de tu servicio",
  robots: { index: false, follow: false },
};

export default async function TallerEstadoPage({ params }: { params: Promise<{ token: string }> }) {
  const vista = await cargarEstadoPublico((await params).token);
  if (!vista) notFound();
  return (
    <main style={vista.marca.estilo} className="min-h-svh bg-background px-4 py-6 sm:px-6 sm:py-10">
      <TallerEstadoPublico marca={vista.marca} orden={vista.orden} />
    </main>
  );
}
