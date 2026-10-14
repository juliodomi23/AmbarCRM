import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSesion } from "@/lib/session";
import { moduloActivo } from "@/lib/modulos";
import { aBigInt } from "@/lib/ids";
import { hoyAR } from "@/lib/contratos-cobros";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { EncabezadoPagina } from "@/components/ui";
import { EstadoAR } from "@/components/ar/EstadoAR";
import { NuevoCobro } from "@/components/ar/NuevoCobro";
import { AccionesContrato } from "@/components/ar/AccionesContrato";
import { FilaCobro } from "@/components/ar/FilaCobro";
import { EmptyState } from "@/components/EmptyState";
import { resumenCobrosCliente } from "@/lib/cobros-resumen-db";
import { ResumenCobrosCliente } from "@/components/ar/ResumenCobrosCliente";

export const dynamic = "force-dynamic";
export default async function ContratoPage({params}:{params:Promise<{id:string}>}) {
  const sesion = await getSesion();
  if(!sesion?.user.orgId)redirect("/login");
  if(!(await moduloActivo("contratos")))redirect("/");
  const id = aBigInt((await params).id);
  if(!id)notFound();
  const contrato = await db.contrato.findFirst({where:{id},include:{contacto:{select:{nombre:true}},cobros:{take:LIMITE_PANEL,orderBy:[{vence:{sort:"asc",nulls:"last"}},{id:"asc"}]},_count:{select:{cobros:true}}}});
  if(!contrato)notFound();
  const resumen = await resumenCobrosCliente(BigInt(sesion.user.orgId), contrato.contactoId, id);
  const hoy = hoyAR();
  const esAdmin = sesion.user.rol === "admin";
  return <div className="min-w-0 space-y-5 p-4 md:p-6"><Link href="/contratos" className="text-sm text-primary hover:underline">← Servicios contratados</Link>
    <EncabezadoPagina titulo={contrato.contacto.nombre} descripcion={contrato.tipo.replaceAll("_"," ")} acciones={<NuevoCobro contratoId={String(id)} />} />
    <section className="surface space-y-4 p-5"><EstadoAR estado={contrato.estado} /><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Mensualidad",contrato.mensualidad===null ? "Por definir" : `$${contrato.mensualidad.toFixed(2)}`],["Cobro",contrato.diaCobro ? `Día ${contrato.diaCobro}` : "Sin día de cobro"],["Monto de cierre",contrato.montoCierre===null ? "Por confirmar" : `$${contrato.montoCierre.toFixed(2)}`],["Inicio mensualidad",contrato.inicioMensualidad?.toISOString().slice(0,10) ?? "Sin fecha"],["Fecha de baja",contrato.fechaBaja?.toISOString().slice(0,10) ?? "Sin baja"]].map(([titulo,valor])=><div key={titulo}><dt className="text-xs text-muted-foreground">{titulo}</dt><dd className="mt-1 font-semibold">{valor}</dd></div>)}</dl><AccionesContrato id={String(id)} estado={contrato.estado} hoy={hoy} esAdmin={esAdmin} />{contrato.notas && <p className="whitespace-pre-line break-words border-t pt-4 text-sm text-muted-foreground">{contrato.notas}</p>}</section>
    <ResumenCobrosCliente resumen={resumen} />
    <h2 className="text-lg font-semibold">Cobros del contrato</h2><p className="text-sm text-muted-foreground">Mostrando {contrato.cobros.length} de {contrato._count.cobros} · <Link href={`/cobros?contratoId=${id}`} className="text-primary hover:underline">Ver todos</Link></p>
    {!contrato.cobros.length && <EmptyState titulo="Sin cargos registrados" descripcion="Usa Nuevo cobro para registrar un cargo." />}
    <div className="space-y-3">{contrato.cobros.map(c=><FilaCobro key={String(c.id)} cobro={{...c,contrato}} hoy={hoy} esAdmin={esAdmin} />)}</div>
  </div>;
}
