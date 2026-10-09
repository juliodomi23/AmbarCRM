import { GestionCita } from "@/components/reservas/GestionCita";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tu cita", robots: { index: false } };

/** Consultar o cancelar una cita con el enlace que recibió el cliente. */
export default async function CitaPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  return <GestionCita token={(await params).token} />;
}
