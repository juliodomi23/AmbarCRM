import { notFound, redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { moduloActivo } from "@/lib/modulos";
import { listarServidores } from "@/lib/servidores-db";
import { EncabezadoPagina } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { FormularioServidor } from "@/components/ar/FormularioServidor";
import { TarjetaServidor } from "@/components/ar/TarjetaServidor";

export const dynamic = "force-dynamic";
export default async function ServidoresPage() {
  const sesion = await getSesion();
  if (!sesion?.user) redirect("/login");
  if (!await moduloActivo("servidores")) notFound();
  const servidores = await listarServidores();
  return <div className="min-w-0 space-y-5 p-4 md:p-6"><EncabezadoPagina titulo="Servidores" descripcion="Infraestructura de Ámbar Rojo · el silencio es la alerta" acciones={<FormularioServidor />} /><p className="text-sm text-muted-foreground">Amarillo desde 80 % de RAM o disco; rojo desde 90 % o tras más de 3 horas sin reportar.</p>{!servidores.length && <EmptyState titulo="Sin servidores" descripcion="Registra el primer servidor e instala su heartbeat." />}<div className="grid min-w-0 gap-4 xl:grid-cols-2">{servidores.map(s => <TarjetaServidor key={String(s.id)} servidor={s} />)}</div></div>;
}
