import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { CreadorIgDashboard } from "@/components/creador-ig/CreadorIgDashboard";

export const dynamic = "force-dynamic";

export default async function CreadorIgPage() {
  if (!(await moduloActivo("creador_ig"))) redirect("/");
  return <CreadorIgDashboard />;
}
