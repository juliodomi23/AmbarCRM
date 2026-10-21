import { redirect } from "next/navigation";
import { CampanasPanel } from "@/components/marketing/CampanasPanel";
import { moduloActivo } from "@/lib/modulos";
import { getSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function MetaAdsPage() {
  const sesion = await getSesion();
  if (!sesion?.user?.orgId) redirect("/login");
  if (!(await moduloActivo("meta_ads"))) redirect("/");
  return <CampanasPanel tipo="meta_ads" esAdmin={sesion.user.rol === "admin"} />;
}
