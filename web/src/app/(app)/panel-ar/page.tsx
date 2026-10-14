import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { getSesion } from "@/lib/session";
import { db } from "@/lib/db";
import { configPanelAR } from "@/lib/contratos-cobros";
import { panelAR } from "@/lib/panel-ar-db";
import { EncabezadoPagina, Badge, tonoEstado } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";

export const dynamic = "force-dynamic";
export default async function PanelARPage() {
  const sesion = await getSesion();
  if (!sesion?.user.orgId) redirect("/login");
  if (!(await moduloActivo("panel_ar"))) redirect("/");
  const [panel, modulo] = await Promise.all([panelAR(BigInt(sesion.user.orgId)), db.moduloOrg.findFirst({ where: { clave: "panel_ar" } })]);
  const config = configPanelAR(modulo?.config);
  const metricas = [
    ["MRR hoy", `$${panel.mrr.toFixed(2)}`], ["MRR proyectado", `$${panel.mrrProyectado.toFixed(2)}`],
    ["Clientes en producción", String(panel.clientesProduccion)], ["Clientes en desarrollo / pruebas", String(panel.clientesDesarrollo)],
    ["Vencido", `$${panel.vencido.toFixed(2)}`], ["Vence en 7 días", `$${panel.vence7Dias.toFixed(2)}`],
    ["Por cobrar este mes", `$${panel.venceMes.toFixed(2)}`], ["Cobrado del mes", `$${panel.cobradoMes.toFixed(2)}`], ["Incobrables", `$${panel.incobrable.toFixed(2)}`],
  ];
  return <div className="space-y-5 p-4 md:p-6">
    <EncabezadoPagina titulo="Panel Ámbar Rojo" descripcion={`Operación comercial · ${panel.fecha} · importes en MXN`}
      acciones={<a className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" href="/api/panel-ar/exportar">Exportar CSV</a>} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metricas.map(([etiqueta, valor]) => <article key={etiqueta} className="surface p-4"><p className="text-xs text-muted-foreground">{etiqueta}</p><strong className="tnum mt-1 block text-2xl">{valor}</strong></article>)}</section>
    {(panel.sinDiaCobro > 0 || panel.sinVencimiento > 0) && <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">{panel.sinDiaCobro} contratos sin día de cobro · {panel.sinVencimiento} cobros pendientes sin vencimiento. Confirma estos datos para programar la cobranza.</p>}
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="surface p-4"><h2 className="mb-3 font-semibold">Calendario de cobros · {panel.mes}</h2>
        {!panel.calendario.length && <EmptyState titulo="Sin vencimientos este mes" descripcion="El cron genera las mensualidades del mes siguiente." />}
        <ul className="divide-y">{panel.calendario.map((cobro) => <li key={String(cobro.id)} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0"><p className="text-sm font-medium break-words">{cobro.contrato.contacto.nombre}</p><p className="text-xs text-muted-foreground">{cobro.vence?.toISOString().slice(0, 10)} · {cobro.concepto}</p></div><div className="flex items-center gap-2 text-sm"><strong>${cobro.monto.toFixed(2)}</strong><Badge tono={tonoEstado(cobro.estado)}>{cobro.estado}</Badge></div></li>)}</ul>
      </section>
      <section className="surface p-4"><h2 className="mb-3 font-semibold">Pipeline abierto por etapa</h2><p className="mb-3 text-xs text-muted-foreground">Suma de cotizaciones abiertas, sin probabilidades.</p>
        {!panel.pipeline.length && <EmptyState titulo="Sin oportunidades abiertas" descripcion="Añade prospectos al embudo comercial." />}
        <ul className="divide-y">{panel.pipeline.map((fila) => <li key={fila.etapa} className="flex items-center justify-between gap-2 py-3 text-sm"><span>{fila.etapa}</span><strong>${fila.valor.toFixed(2)}</strong></li>)}</ul>
      </section>
    </div>
    <section className="surface space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Reparto informativo · cobros pagados del mes</h2>
      {sesion.user.rol === "admin" && <FormularioModulo discreto boton="Configurar reparto" titulo="Reparto de comisiones" endpoint="/api/panel-ar/ajustes" valores={{ proyectoCtoPct: config.proyectoCtoPct.toString(), mensualidadCtoPct: config.mensualidadCtoPct.toString(), credito_ia_mxn: config.creditoIA.toString() }} campos={[
        { nombre: "proyectoCtoPct", etiqueta: "CTO · proyecto nuevo (%)", tipo: "dinero", requerido: true }, { nombre: "mensualidadCtoPct", etiqueta: "CTO · mensualidad (%)", tipo: "dinero", requerido: true }, { nombre: "credito_ia_mxn", etiqueta: "Crédito IA por cliente y mes (MXN)", tipo: "dinero", requerido: true },
      ]} />}</div>
      <p className="text-xs text-muted-foreground">Proyecto: {config.proyectoCtoPct.toString()} % CTO / {config.proyectoCtoPct.neg().plus(100).toString()} % CEO. Mensualidad: {config.mensualidadCtoPct.toString()} % CTO / {config.mensualidadCtoPct.neg().plus(100).toString()} % CEO, después de crédito IA de ${config.creditoIA.toFixed(2)} una vez por cliente y mes de servicio. No mueve dinero.</p>
      <div className="grid gap-3 sm:grid-cols-3">{[["CTO", panel.comisiones.cto], ["CEO", panel.comisiones.ceo], ["Crédito IA", panel.comisiones.creditoIA]].map(([nombre, monto]) => <div key={String(nombre)}><p className="text-xs text-muted-foreground">{String(nombre)}</p><strong className="text-xl">${typeof monto === "string" ? monto : monto.toFixed(2)}</strong></div>)}</div>
      <ul className="divide-y">{panel.pagos.map((pago) => <li key={String(pago.id)} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><p>{pago.contrato.contacto.nombre} · {pago.concepto}</p><p className="text-xs text-muted-foreground">Cobro #{String(pago.id)} · ${pago.monto.toFixed(2)}</p></div><p>{pago.comision.pendiente ? "Reparto de extras por definir" : `CTO $${pago.comision.cto.toFixed(2)} · CEO $${pago.comision.ceo.toFixed(2)} · IA $${pago.comision.creditoIA.toFixed(2)}`}</p></li>)}</ul>
    </section>
  </div>;
}
