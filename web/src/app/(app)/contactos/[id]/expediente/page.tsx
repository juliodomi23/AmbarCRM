import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";

export default async function ExpedienteAnterior({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = (await params).id;
  redirect((await moduloActivo("pacientes")) ? `/pacientes/${id}` : `/clientes/${id}`);
}
