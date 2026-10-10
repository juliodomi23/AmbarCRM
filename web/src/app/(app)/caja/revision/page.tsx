import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { RevisionSinRed } from "@/components/caja/RevisionSinRed";
import { authOptions } from "@/lib/auth";
import { puedeGestionarTurnos } from "@/lib/caja";
import { panelRevisionSinRed } from "@/lib/caja-revision-db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function RevisionCajaPage() {
  const sesion = await getServerSession(authOptions);
  if (!sesion?.user?.orgId) redirect("/login");
  if (!(await moduloActivo("caja"))) redirect("/");
  if (!puedeGestionarTurnos(sesion.user.rol, sesion.user.puesto)) redirect("/caja");
  const datos = await panelRevisionSinRed(BigInt(sesion.user.orgId));
  return <RevisionSinRed datos={serializar(datos)} />;
}
