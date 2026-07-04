import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSesion } from "@/lib/session";
import { getEmbudosConEtapas, listarUsuarios, listarCanales, listarPlantillas, getAjustes } from "@/lib/services/config";
import { listarBots } from "@/lib/services/bots";
import { serializar } from "@/lib/serialize";
import { ConfiguracionCliente } from "@/components/config/ConfiguracionCliente";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const session = await getSesion();
  if (session?.user?.rol !== "admin") redirect("/embudos");

  // Solo la org plataforma (Ámbar Rojo, id=1) administra clientes (tenants).
  const esPlataforma = (session.user as any)?.orgId === "1";

  const [embudos, usuarios, canales, plantillas, ajustes, bots, orgs] = await Promise.all([
    getEmbudosConEtapas(),
    listarUsuarios(),
    listarCanales(),
    listarPlantillas(),
    getAjustes(),
    listarBots(),
    esPlataforma ? db.org.findMany({ orderBy: { id: "asc" } }) : Promise.resolve(null)
  ]);

  return (
    <ConfiguracionCliente
      embudos={serializar(embudos)}
      usuarios={serializar(usuarios)}
      canales={serializar(canales)}
      plantillas={serializar(plantillas)}
      ajustes={serializar(ajustes)}
      bots={serializar(bots)}
      orgs={orgs ? serializar(orgs) : null}
    />
  );
}
