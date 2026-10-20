import { AccesoPublico } from "@/components/auth/AccesoPublico";
import { RestablecerForm } from "@/components/auth/RestablecerForm";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function RestablecerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AccesoPublico titulo="Elige una contraseña nueva"><RestablecerForm token={token} /></AccesoPublico>;
}
