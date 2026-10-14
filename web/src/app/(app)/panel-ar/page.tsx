import Link from "next/link";
import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { getSesion } from "@/lib/session";
import { db } from "@/lib/db";
import { configPanelAR } from "@/lib/contratos-cobros";
import { panelAR } from "@/lib/panel-ar-db";
import { EncabezadoPagina } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { FilaCobro } from "@/components/ar/FilaCobro";
import { EstadoAR } from "@/components/ar/EstadoAR";

export const dynamic = "force-dynamic";
export default async function PanelARPage() {
  const sesion = await getSesion();
  if(!sesion?.user.orgId)redirect("/login");
  if(!(await moduloActivo("panel_ar")))redirect("/");
  const [panel,modulo] = await Promise.all([panelAR(BigInt(sesion.user.orgId)),db.moduloOrg.findFirst({where:{clave:"panel_ar"}})]);
  const config = configPanelAR(modulo?.config);
  const esAdmin = sesion.user.rol==="admin";
  const totalMes = panel.cobradoMes.plus(panel.venceMes);
  const porcentaje = totalMes.gt(0) ? panel.cobradoMes.div(totalMes).mul(100).toNumber() : 0;
  const maxPipeline = panel.pipeline.reduce((m,f)=>f.valor.gt(m) ? f.valor : m,panel.mrr.mul(0));
  const principales = [
    {titulo:"MRR hoy",valor:"$"+panel.mrr.toFixed(2),nota:"Mensualidades en producción",color:"!border-t-emerald-600"},
    {titulo:"Por cobrar vencido",valor:"$"+panel.vencido.toFixed(2),nota:"Saldo pendiente de fechas pasadas",color:"!border-t-red-600"},
    {titulo:"Cobrado del mes",valor:"$"+panel.cobradoMes.toFixed(2),nota:"Pagos y abonos recibidos",color:"!border-t-emerald-600"},
    {titulo:"Clientes en producción",valor:String(panel.clientesProduccion),nota:"Clientes únicos, aunque tengan varios servicios",color:"!border-t-blue-600"},
  ];
  return <div className="min-w-0 space-y-6 p-4 md:p-6">
    <EncabezadoPagina titulo="Panel Ámbar Rojo" descripcion={`Operación comercial · ${panel.fecha} · MXN`} acciones={<a className="rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-muted" href="/api/panel-ar/exportar">Exportar CSV</a>} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{principales.map(k=><article key={k.titulo} className={`surface !border-t-4 p-5 ${k.color}`}><p className="text-sm font-medium">{k.titulo}</p><strong className="mt-4 block text-4xl font-bold tracking-tight tnum">{k.valor}</strong><p className="mt-3 text-xs text-muted-foreground">{k.nota}</p></article>)}</section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["MRR proyectado","$"+panel.mrrProyectado.toFixed(2)],["Vence en 7 días","$"+panel.vence7Dias.toFixed(2)],["Por cobrar este mes","$"+panel.venceMes.toFixed(2)],["Desarrollo / pruebas",String(panel.clientesDesarrollo)],["Incobrables","$"+panel.incobrable.toFixed(2)]].map(([titulo,valor])=><article key={titulo} className="surface p-4"><p className="text-xs text-muted-foreground">{titulo}</p><strong className="mt-2 block text-xl tnum">{valor}</strong></article>)}</section>
    {(panel.sinDiaCobro>0 || panel.sinVencimiento>0) && <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">{panel.sinDiaCobro} contratos sin día de cobro · {panel.sinVencimiento} cargos sin vencimiento. Confirma las fechas para programar la cobranza.</p>}
    <div className="grid gap-4 lg:grid-cols-2"><section className="surface space-y-4 p-5"><h2 className="font-semibold">Cobranza del mes</h2><div className="flex flex-wrap justify-between gap-2 text-sm"><span className="text-emerald-800 dark:text-emerald-200">Cobrado <strong>${panel.cobradoMes.toFixed(2)}</strong></span><span>Por cobrar <strong>${panel.venceMes.toFixed(2)}</strong></span></div><div role="img" aria-label={`Cobrado ${panel.cobradoMes.toFixed(2)}; por cobrar ${panel.venceMes.toFixed(2)} MXN`} className="h-5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-emerald-600" style={{width:porcentaje+"%"}} /></div><p className="text-xs text-muted-foreground">Abonos recibidos y saldos con vencimiento en {panel.mes}. Los pagos históricos sin fecha quedan fuera.</p></section>
      <section className="surface space-y-4 p-5"><h2 className="font-semibold">Pipeline abierto por etapa</h2>{!panel.pipeline.length && <EmptyState titulo="Sin oportunidades abiertas" descripcion="Los contratos ganados y las bajas están en el embudo." />}{panel.pipeline.map(f=><div key={f.etapa}><div className="mb-2 flex justify-between gap-2 text-sm"><span>{f.etapa}</span><strong>${f.valor.toFixed(2)}</strong></div><div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:(maxPipeline.gt(0) ? f.valor.div(maxPipeline).mul(100).toNumber() : 0)+"%"}} /></div></div>)}<Link className="inline-block text-sm text-primary hover:underline" href="/embudos">Ver todos los clientes y prospectos →</Link></section></div>
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Por cobrar</h2><Link href="/cobros" className="text-sm text-primary hover:underline">Ver todos los cobros →</Link></div><p className="text-xs text-muted-foreground">Mostrando {panel.pendientes.length} de {panel.totalPendientes} pendientes, empezando por el vencimiento.</p>{!panel.pendientes.length && <EmptyState titulo="Sin saldos pendientes" descripcion="Los nuevos cargos aparecerán aquí." />}{panel.pendientes.map(c=><FilaCobro key={String(c.id)} cobro={c} hoy={panel.fecha} esAdmin={esAdmin} />)}</section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Calendario · {panel.mes}</h2><p className="text-xs text-muted-foreground">Mostrando {panel.calendario.length} de {panel.totalCalendario} cargos del mes.</p>{!panel.calendario.length && <EmptyState titulo="Sin vencimientos este mes" descripcion="Los cobros sin fecha quedan por confirmar." />}{panel.calendario.map(c=><FilaCobro key={String(c.id)} cobro={c} hoy={panel.fecha} esAdmin={esAdmin} />)}</section>
    <section className="surface space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Reparto informativo del mes</h2>{esAdmin && <FormularioModulo discreto boton="Configurar reparto" titulo="Reparto de comisiones" endpoint="/api/panel-ar/ajustes" valores={{proyectoCtoPct:config.proyectoCtoPct.toString(),mensualidadCtoPct:config.mensualidadCtoPct.toString(),credito_ia_mxn:config.creditoIA.toString()}} campos={[{nombre:"proyectoCtoPct",etiqueta:"CTO · proyecto nuevo (%)",tipo:"dinero",requerido:true},{nombre:"mensualidadCtoPct",etiqueta:"CTO · mensualidad (%)",tipo:"dinero",requerido:true},{nombre:"credito_ia_mxn",etiqueta:"Crédito IA por cliente y mes (MXN)",tipo:"dinero",requerido:true}]} />}</div><p className="text-xs text-muted-foreground">Proyecto {config.proyectoCtoPct.toString()} % CTO / {config.proyectoCtoPct.neg().plus(100).toString()} % CEO. Mensualidad {config.mensualidadCtoPct.toString()} / {config.mensualidadCtoPct.neg().plus(100).toString()} tras crédito IA de ${config.creditoIA.toFixed(2)} por cliente y mes de servicio. No mueve dinero.</p><div className="grid gap-3 sm:grid-cols-3">{[["CTO",panel.comisiones.cto],["CEO",panel.comisiones.ceo],["Crédito IA",panel.comisiones.creditoIA]].map(([nombre,monto])=><div key={String(nombre)}><p className="text-xs text-muted-foreground">{String(nombre)}</p><strong className="text-2xl tnum">${typeof monto==="string" ? monto : monto.toFixed(2)}</strong></div>)}</div><ul className="divide-y">{panel.pagos.map(p=><li key={String(p.id)} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="break-words">{p.contrato.contacto.nombre} · {p.concepto}</p><p className="text-xs text-muted-foreground">Cobro #{String(p.cobroId)} · ${p.monto.toFixed(2)}</p></div><EstadoAR estado="pagado" /><p>{p.comision.pendiente ? "Reparto de extras por definir" : `CTO $${p.comision.cto.toFixed(2)} · CEO $${p.comision.ceo.toFixed(2)} · IA $${p.comision.creditoIA.toFixed(2)}`}</p></li>)}</ul></section>
  </div>;
}
