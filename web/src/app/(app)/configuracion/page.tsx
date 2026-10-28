import { redirect } from "next/navigation";
import { db, runWithOrg } from "@/lib/db";
import { MODULOS, puestoPuedeAcceder } from "@/lib/modulos";
import { moduloVisibleEnOrg } from "@/lib/modulos-plataforma";
import { puestosParaModulos } from "@/lib/puestos";
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
import { AvisoConexionInstagram } from "@/components/config/AvisoConexionInstagram";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage({ searchParams }: { searchParams: Promise<{ instagram?: string; instagram_mensaje?: string }> }) {
  const session = await getSesion();
  if (session?.user?.rol !== "admin") redirect("/embudos");

  // Solo la org plataforma (Ámbar Rojo, id=1) administra clientes (tenants).
  const esPlataforma = (session.user as any)?.orgId === "1";

  const [embudos, usuarios, canales, plantillas, ajustes, bots, orgs, modulosActivos] =
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
      db.moduloOrg.findMany({
        where: { activo: true },
        select: { clave: true, config: true },
      }),
    ]);
  const usuariosConAcceso = usuarios.map((usuario) => ({
    ...usuario,
    modulosAccesibles: modulosActivos
      .filter((activo) => {
        const modulo = MODULOS.find((item) => item.clave === activo.clave);
        return modulo && moduloVisibleEnOrg(modulo, session.user.orgId) && puestoPuedeAcceder(
          modulo.clave,
          activo.config,
          usuario.puesto,
          usuario.rol,
        );
      })
      .map((activo) => MODULOS.find((item) => item.clave === activo.clave)?.nombre)
      .filter(Boolean),
  }));
  const puestosSugeridos = puestosParaModulos(modulosActivos.map((modulo) => modulo.clave));
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

  const parametros = await searchParams;
  return (
    <>
    <AvisoConexionInstagram estado={parametros.instagram} mensaje={parametros.instagram_mensaje} />
    <ConfiguracionCliente
      abrirCanales={Boolean(parametros.instagram)}
      especialistasAgenda={serializar(await db.doctor.findMany({ select: { id: true, nombre: true, activo: true }, orderBy: { nombre: "asc" } }))}
      citasHabilitadas={modulosActivos.some((m) => m.clave === "citas")}
      embudos={serializar(embudos)}
      usuarios={serializar(usuariosConAcceso)}
      puestosSugeridos={puestosSugeridos}
      canales={serializar(canales)}
      metaRevision={(process.env.META_CANALES_REVISION_ORGS ?? "").split(",").map((id) => id.trim()).includes(String(session.user.orgId))}
      plantillas={serializar(plantillas)}
      ajustes={serializar(ajustes)}
      esExi={String(session.user.orgId) === "12"}
      bots={serializar(bots)}
      orgs={orgs ? serializar(orgs) : null}
      modulosPorOrg={modulosPorOrg ? serializar(modulosPorOrg) : null}
      modulos={MODULOS.filter(m => moduloVisibleEnOrg(m, session.user.orgId))}
      modulosClientes={esPlataforma ? [...MODULOS] : []}
    />
    </>
  );
}
