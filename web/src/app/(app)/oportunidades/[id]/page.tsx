import { notFound } from "next/navigation";
import { getOportunidad } from "@/lib/services/oportunidad";
import { serializar } from "@/lib/serialize";
import { OportunidadCliente } from "@/components/oportunidad/OportunidadCliente";

export const dynamic = "force-dynamic";

export default async function OportunidadPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const op = await getOportunidad(BigInt(params.id));
  if (!op) notFound();

  return <OportunidadCliente op={serializar(op)} />;
}
