import { AccesoPublico } from "@/components/auth/AccesoPublico";
import { RecuperarForm } from "@/components/auth/RecuperarForm";

export const dynamic = "force-dynamic";

export default async function RecuperarPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org } = await searchParams;
  return <AccesoPublico titulo="Recupera tu contraseña"><RecuperarForm orgInicial={typeof org === "string" ? org : ""} /></AccesoPublico>;
}
