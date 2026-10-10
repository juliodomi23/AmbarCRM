import { notFound, redirect } from "next/navigation";
import { ReportesRetailCliente } from "@/components/retail/ReportesRetailCliente";
import { moduloActivo } from "@/lib/modulos";
import { puedeVerReportesRetail } from "@/lib/reportes-retail";
import { getSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ReportesRetailPage() {
  const sesion = await getSesion();
  if (!sesion?.user) redirect("/login");
  if (!puedeVerReportesRetail(sesion.user.rol, sesion.user.puesto)) redirect("/");
  if (!(await moduloActivo("caja"))) notFound();
  return <ReportesRetailCliente />;
}
