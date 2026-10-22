import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { getSesion } from "@/lib/session";
import { CampanasEnvioPanel } from "@/components/campanas-envio/CampanasEnvioPanel";

export const dynamic = "force-dynamic";

export default async function CampanasEnvioPage() {
  const sesion = await getSesion();
  if (!sesion?.user?.orgId) redirect("/login");
  if (!(await moduloActivo("campanas_envio"))) redirect("/");
  return <CampanasEnvioPanel esAdmin={sesion.user.rol === "admin"} />;
}
