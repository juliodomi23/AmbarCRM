import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";

export const dynamic = "force-dynamic";

// Solo se usa Auditoría fiscal a clientes; la evaluación interna por área quedó sin uso.
export default async function AuditoriaPage() {
  if (!(await moduloActivo("auditoria"))) redirect("/");
  redirect("/auditoria/fiscal");
}
