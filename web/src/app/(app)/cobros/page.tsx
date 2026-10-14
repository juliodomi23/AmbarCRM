import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { getSesion } from "@/lib/session";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { hoyAR, fechaAR } from "@/lib/contratos-cobros";
import { grupoCobro } from "@/lib/ar-vistas";
import { aBigInt } from "@/lib/ids";
import { EncabezadoPagina } from "@/components/ui";
import { NuevoCobro } from "@/components/ar/NuevoCobro";
import { FilaCobro } from "@/components/ar/FilaCobro";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { EmptyState } from "@/components/EmptyState";
import { incluirContrato } from "@/lib/cobros-db";

export const dynamic = "force-dynamic";
export default async function CobrosPage({searchParams}:{searchParams:Promise<{q?:string;pagina?:string;contratoId?:string}>}) {
  const sesion = await getSesion();
  if(!sesion?.user.orgId)redirect("/login");
  if(!(await moduloActivo("cobros")))redirect("/");
  const parametros = await searchParams;
  const q = (parametros.q ?? "").trim().slice(0,100);
  const pagina = Math.floor(Math.max(1,Math.min(10000,Number(parametros.pagina)||1)));
  const contratoId = aBigInt(parametros.contratoId);
  const where:Prisma.CobroWhereInput = { ...(contratoId ? {contratoId} : {}), ...(q ? {OR:[{contrato:{contacto:{nombre:{contains:q,mode:"insensitive"}}}},{concepto:{contains:q,mode:"insensitive"}},{referencia:{contains:q,mode:"insensitive"}}]} : {}) };
  const [cobros,total,abiertos,abonado,legacy,modulo] = await Promise.all([
    db.cobro.findMany({take:LIMITE_PANEL,skip:(pagina-1)*LIMITE_PANEL,where,include:incluirContrato,orderBy:[{vence:{sort:"asc",nulls:"last"}},{id:"asc"}]}),
    db.cobro.count({where}),db.cobro.aggregate({where:{estado:{in:["pendiente","vencido"]}},_sum:{monto:true,montoPagado:true}}),
    db.cobro.aggregate({_sum:{montoPagado:true}}),db.cobro.aggregate({where:{estado:"pagado",pagos:{equals:[]}},_sum:{monto:true}}),
    db.moduloOrg.findFirst({where:{clave:"cobros"}}),
  ]);
  const hoy = hoyAR();
  const esAdmin = sesion.user.rol === "admin";
  const plantilla = (modulo?.config as {plantillaCobro?:{name:string;language:string}}|null)?.plantillaCobro;
  const grupos = ["Vencidos","Esta semana","Este mes","Después","Pagados","Historial"];
  const enlace = (n:number)=>`/cobros?pagina=${n}&q=${encodeURIComponent(q)}${contratoId ? "&contratoId="+contratoId : ""}`;
  return <div className="min-w-0 space-y-6 p-4 md:p-6">
    <EncabezadoPagina titulo="Cobros y fechas de pago" descripcion="Primero lo vencido; después las próximas fechas y el historial de pagos." acciones={<NuevoCobro />} />
    <section className="grid gap-3 sm:grid-cols-2"><article className="surface p-5"><p className="text-sm text-muted-foreground">Por cobrar · saldo pendiente</p><strong className="mt-2 block text-3xl tnum">${abiertos._sum.monto?.minus(abiertos._sum.montoPagado ?? 0).toFixed(2) ?? "0.00"}</strong></article><article className="surface p-5"><p className="text-sm text-muted-foreground">Cobrado registrado · todos los periodos</p><strong className="mt-2 block text-3xl text-emerald-800 dark:text-emerald-200 tnum">${abonado._sum.montoPagado?.plus(legacy._sum.monto ?? 0).toFixed(2) ?? legacy._sum.monto?.toFixed(2) ?? "0.00"}</strong></article></section>
    <form method="get" className="flex gap-2">{contratoId && <input type="hidden" name="contratoId" value={String(contratoId)} />}<input name="q" defaultValue={q} aria-label="Buscar cobros" placeholder="Buscar cliente, concepto o referencia…" className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2 text-sm" /><button className="rounded-lg bg-muted px-3 py-2 text-sm">Buscar</button></form>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Mostrando {cobros.length} de {total} cobros{contratoId && <> · <Link href="/cobros" className="text-primary hover:underline">Ver todos los contratos</Link></>}</p>{esAdmin && <FormularioModulo discreto boton="Configurar recordatorio" titulo="Recordatorios manuales" endpoint="/api/cobros/ajustes" valores={{plantillaNombre:plantilla?.name ?? "",plantillaIdioma:plantilla?.language ?? "es_MX"}} campos={[{nombre:"plantillaNombre",etiqueta:"Plantilla aprobada",tipo:"texto"},{nombre:"plantillaIdioma",etiqueta:"Idioma",tipo:"texto"}]} />}</div>
    {!cobros.length && <EmptyState titulo="Sin cobros en esta vista" descripcion="Usa Nuevo cobro o cambia la búsqueda." />}
    {grupos.map(grupo=>{const filas=cobros.filter(c=>grupoCobro(c,fechaAR(hoy)!)===grupo);return filas.length>0 && <section key={grupo} className="space-y-3"><h2 className={`text-lg font-semibold ${grupo==="Vencidos" ? "text-red-800 dark:text-red-200" : ""}`}>{grupo} <span className="text-sm font-normal text-muted-foreground">{filas.length}</span></h2>{filas.map(c=><FilaCobro key={String(c.id)} cobro={c} hoy={hoy} esAdmin={esAdmin} />)}</section>;})}
    {total>LIMITE_PANEL && <nav className="flex gap-3 text-sm" aria-label="Páginas de cobros">{pagina>1 && <Link href={enlace(pagina-1)}>Anterior</Link>}<span>Página {pagina}</span>{pagina*LIMITE_PANEL<total && <Link href={enlace(pagina+1)}>Siguiente</Link>}</nav>}
  </div>;
}
