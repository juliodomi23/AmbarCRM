import { redirect } from "next/navigation";
import { db, runWithOrg } from "@/lib/db";
import { MODULOS } from "@/lib/modulos";
import { getSesion } from "@/lib/session";
import {
  getEmbudosConEtapas,
  listarUsuarios,
  listarCanales,
  listarPlantillas,
  getAjustes,
} from "@/lib/services/config";
import { listarBots } from "@/lib/services/bots";
import { serializar } from "@/lib/serialize";
import { ConfiguracionCliente } from "@/components/config/ConfiguracionCliente";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const session = await getSesion();
  if (session?.user?.rol !== "admin") redirect("/embudos");

  // Solo la org plataforma (Ámbar Rojo, id=1) administra clientes (tenants).
  const esPlataforma = (session.user as any)?.orgId === "1";

  const [embudos, usuarios, canales, plantillas, ajustes, bots, orgs] =
    await Promise.all([
      getEmbudosConEtapas(),
      listarUsuarios(),
      listarCanales(),
      listarPlantillas(),
      getAjustes(),
      listarBots(),
      esPlataforma
        ? db.org.findMany({ orderBy: { id: "asc" } })
        : Promise.resolve(null),
    ]);
  const modulosPorOrg = orgs
    ? Object.fromEntries(
        await Promise.all(
          orgs.map(async (org) => [
            String(org.id),
            await runWithOrg(org.id, () =>
              db.moduloOrg.findMany({ select: { clave: true, activo: true } }),
            ),
          ]),
        ),
      )
    : null;

  return (
    <ConfiguracionCliente
      embudos={serializar(embudos)}
      usuarios={serializar(usuarios)}
      canales={serializar(canales)}
      plantillas={serializar(plantillas)}
      ajustes={serializar(ajustes)}
      bots={serializar(bots)}
      orgs={orgs ? serializar(orgs) : null}
      modulosPorOrg={modulosPorOrg ? serializar(modulosPorOrg) : null}
      modulos={[...MODULOS]}
    />
  );
}
