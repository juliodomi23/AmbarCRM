import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { getSesion } from "@/lib/session";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { camposContrato } from "@/lib/campos-ar";
import { filtroContratosAR } from "@/lib/ar-vistas";
import { hoyAR } from "@/lib/contratos-cobros";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { EncabezadoPagina } from "@/components/ui";
import { FichaContrato } from "@/components/ar/FichaContrato";
import { MostrarBajas } from "@/components/ar/MostrarBajas";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";
export default async function ContratosPage({searchParams}:{searchParams:Promise<{bajas?:string;q?:string;pagina?:string}>}) {
  const sesion = await getSesion();
  if(!sesion?.user.orgId)redirect("/login");
  if(!(await moduloActivo("contratos")))redirect("/");
  const parametros = await searchParams;
  const bajas = parametros.bajas === "1";
  const q = (parametros.q ?? "").trim().slice(0,100);
  const pagina = Math.floor(Math.max(1,Math.min(10000,Number(parametros.pagina)||1)));
  const where = filtroContratosAR(bajas,q);
  const [contratos,total,registrados,produccion,desarrollo,ocultos,contactos] = await Promise.all([
    db.contrato.findMany({take:LIMITE_PANEL,skip:(pagina-1)*LIMITE_PANEL,where,include:{contacto:{select:{id:true,nombre:true}}},orderBy:{id:"desc"}}),
    db.contrato.count({where}),db.contrato.count(),db.contrato.count({where:{estado:"produccion"}}),
    db.contrato.count({where:{estado:{in:["en_desarrollo","en_pruebas"]}}}),db.contrato.count({where:{estado:{in:["baja","incobrable"]}}}),
    db.contacto.findMany({take:LIMITE_PANEL,select:{id:true,nombre:true},orderBy:{nombre:"asc"}}),
  ]);
  const clientes = new Map([...contactos,...contratos.map(c=>c.contacto)].map(c=>[String(c.id),c.nombre]));
  const servidores = await moduloActivo("servidores") ? await db.servidor.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }) : undefined;
  const campos = camposContrato([...clientes].map(([valor,etiqueta])=>({valor,etiqueta})), servidores?.map(s => ({ valor: String(s.id), etiqueta: s.nombre })));
  const grupos = [
    {titulo:"Producción",estados:["produccion"]},{titulo:"Desarrollo y pruebas",estados:["en_desarrollo","en_pruebas"]},
    {titulo:"Pausados",estados:["pausado"]},{titulo:"Por confirmar",estados:[""]},{titulo:"Bajas e incobrables",estados:["baja","incobrable"]},
  ];
  const enlace = (n:number)=>`/contratos?pagina=${n}&q=${encodeURIComponent(q)}${bajas ? "&bajas=1" : ""}`;
  return <div className="min-w-0 space-y-6 p-4 md:p-6">
    <EncabezadoPagina titulo="Servicios contratados" descripcion="Servicios, mensualidades y fechas de cobro de tus clientes." acciones={<FormularioModulo boton="Nuevo contrato" titulo="Nuevo servicio contratado" endpoint="/api/contratos" campos={camposContrato()} />} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Registrados",registrados],["En producción",produccion],["Desarrollo / pruebas",desarrollo],["Bajas / incobrables",ocultos]].map(([nombre,valor])=><article key={nombre} className="surface p-4"><p className="text-xs text-muted-foreground">{nombre}</p><strong className="mt-1 block text-3xl">{valor}</strong></article>)}</section>
    <div className="flex flex-wrap items-center justify-between gap-3"><form method="get" className="flex min-w-0 flex-1 gap-2">{bajas && <input type="hidden" name="bajas" value="1" />}<input name="q" defaultValue={q} aria-label="Buscar contratos" placeholder="Buscar cliente o servicio…" className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2 text-sm" /><button className="rounded-lg bg-muted px-3 py-2 text-sm">Buscar</button></form><MostrarBajas activo={bajas} /></div>
    <p className="text-sm text-muted-foreground">Mostrando {contratos.length} de {total} contratos{!bajas && ` · ${ocultos} bajas/incobrables ocultos en la organización`}</p>
    {!contratos.length && <EmptyState titulo="Sin contratos en esta vista" descripcion="Cambia la búsqueda o activa Mostrar bajas para consultar el historial." />}
    {grupos.map(grupo=>{const filas=contratos.filter(c=>grupo.estados.includes(c.estado ?? ""));return filas.length>0 && <section key={grupo.titulo} className="space-y-3"><h2 className="text-base font-semibold">{grupo.titulo} <span className="ml-1 text-sm font-normal text-muted-foreground">{filas.length}</span></h2><div className="grid gap-3 xl:grid-cols-2">{filas.map(c=><FichaContrato key={String(c.id)} contrato={c} campos={campos} hoy={hoyAR()} esAdmin={sesion.user.rol==="admin"} />)}</div></section>;})}
    {total>LIMITE_PANEL && <nav className="flex gap-3 text-sm" aria-label="Páginas de contratos">{pagina>1 && <Link href={enlace(pagina-1)}>Anterior</Link>}<span>Página {pagina}</span>{pagina*LIMITE_PANEL<total && <Link href={enlace(pagina+1)}>Siguiente</Link>}</nav>}
  </div>;
}
