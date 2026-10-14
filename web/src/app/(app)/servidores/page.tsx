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
  return <div className="min-w-0 space-y-5 p-4 md:p-6">
    <div className="surface space-y-3 p-4 sm:p-5">
      <EncabezadoPagina eyebrow="Infraestructura · Ámbar Rojo" titulo="Servidores" descripcion="Estado de recursos, vencimientos y cargas." acciones={<FormularioServidor />} />
      <details className="text-xs text-muted-foreground"><summary className="min-h-11 w-fit cursor-pointer rounded-lg py-3">Cómo se determina el estado</summary><p className="max-w-prose pb-1 leading-relaxed">Amarillo desde 80 % de RAM o disco; rojo desde 90 % o tras más de 3 horas sin reportar. Sin reportes, el estado es «Sin datos».</p></details>
    </div>
    {!servidores.length && <EmptyState titulo="Sin servidores" descripcion="Registra el primer servidor e instala su heartbeat." />}
    <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-2">{servidores.map(s => <TarjetaServidor key={String(s.id)} servidor={s} />)}</div>
  </div>;
}
