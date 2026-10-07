import { redirect } from "next/navigation";

export default async function ExpedienteAnterior({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  redirect(`/clientes/${(await params).id}`);
}
