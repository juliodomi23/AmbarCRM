import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { getSesion } from "@/lib/session";
import { MetaAdsDashboard } from "@/components/meta-ads/MetaAdsDashboard";

export const dynamic = "force-dynamic";

export default async function MetaAdsPage() {
  const sesion = await getSesion();
  if (!sesion?.user?.orgId) redirect("/login");
  if (!(await moduloActivo("meta_ads"))) redirect("/");
  return <MetaAdsDashboard esAdmin={sesion.user.rol === "admin"} />;
}