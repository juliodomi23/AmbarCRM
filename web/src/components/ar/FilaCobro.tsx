import type { Cobro } from "@prisma/client";
import Link from "next/link";
import { fechaAR } from "@/lib/contratos-cobros";
import { saldoCobro, estiloAR } from "@/lib/ar-vistas";
import { EstadoAR } from "./EstadoAR";
import { RegistrarPago } from "./RegistrarPago";
import { AccionCobro } from "./AccionCobro";
import { RecordarCobro } from "./RecordarCobro";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";

export function FilaCobro({ cobro,hoy,esAdmin }: { cobro:Cobro & {contrato:{tipo:string;contacto:{nombre:string}}}; hoy:string;esAdmin:boolean }) {
  const abierto = ["pendiente","vencido"].includes(cobro.estado);
  const dias = cobro.vence ? Math.floor((fechaAR(hoy)!.getTime()-cobro.vence.getTime())/86400000) : 0;
  const estado = abierto && dias > 0 ? "vencido" : cobro.estado;
  const saldo = saldoCobro(cobro);
  const accion = esAdmin && (abierto || estado === "pagado") ? "cancelar" : esAdmin && estado === "cancelado" && !(cobro.concepto === "mensualidad" && cobro.periodo) ? "eliminar" : null;
  const accionCobro = accion && <AccionCobro id={String(cobro.id)} accion={accion} cliente={cobro.contrato.contacto.nombre} concepto={cobro.concepto} monto={cobro.monto.toFixed(2)} />;
  return <article className={`surface flex min-w-0 flex-wrap items-center justify-between gap-4 !border-l-4 p-4 ${estiloAR(estado).borde}`} data-cobro-id={String(cobro.id)}>
    <div className="min-w-0"><Link href={`/contratos/${cobro.contratoId}`} className="break-words text-base font-semibold hover:underline">{cobro.contrato.contacto.nombre}</Link><p className="mt-1 text-sm text-muted-foreground">{cobro.concepto} · {cobro.periodo?.toISOString().slice(0,7) ?? cobro.contrato.tipo.replaceAll("_"," ")}</p><p className={`mt-2 text-base font-semibold ${estado === "vencido" ? "text-red-800 dark:text-red-200" : ""}`}>Vence {cobro.vence?.toISOString().slice(0,10) ?? "por confirmar"}{estado === "vencido" && <span className="ml-2 text-sm">hace {dias} {dias === 1 ? "día" : "días"}</span>}</p></div>
    <div className="space-y-2"><p className="text-2xl font-bold tnum">${(abierto || estado === "incobrable" ? saldo : cobro.monto).toFixed(2)} <span className="text-xs font-normal text-muted-foreground">MXN{abierto ? " · saldo" : ""}</span></p><EstadoAR estado={estado} />{cobro.montoPagado.gt(0) && <p className="text-xs text-muted-foreground">Recibido ${cobro.montoPagado.toFixed(2)} de ${cobro.monto.toFixed(2)}</p>}</div>
    {abierto && <div className="flex w-full flex-wrap items-start gap-3 sm:w-auto"><RegistrarPago id={String(cobro.id)} saldo={saldo.toFixed(2)} hoy={hoy} cliente={cobro.contrato.contacto.nombre} /><details className="rounded-lg border p-2 text-sm"><summary className="cursor-pointer">Más acciones</summary><div className="mt-3 flex max-w-full flex-col items-start gap-4">
      <FormularioModulo discreto boton={cobro.vence ? "Cambiar vencimiento" : "Definir vencimiento"} titulo="Vencimiento del cobro" endpoint={`/api/cobros/${cobro.id}`} valores={{vence:cobro.vence?.toISOString().slice(0,10) ?? ""}} campos={[{nombre:"vence",etiqueta:"Vencimiento",tipo:"fecha"}]} />
      <RecordarCobro id={String(cobro.id)} />
      {accionCobro}
      {esAdmin && <FormularioModulo discreto boton="Marcar incobrable" titulo="Marcar incobrable" endpoint={`/api/cobros/${cobro.id}`} valores={{estado:"incobrable",nota:""}} campos={[{nombre:"estado",etiqueta:"Acción",tipo:"seleccion",opciones:[{valor:"incobrable",etiqueta:"Marcar incobrable"}]},{nombre:"nota",etiqueta:"Motivo (obligatorio)",tipo:"textarea",requerido:true}]} />}
    </div></details></div>}
    {!abierto && accionCobro && <div className="flex w-full flex-wrap gap-3 sm:w-auto">{accionCobro}</div>}
    {esAdmin && estado === "cancelado" && cobro.concepto === "mensualidad" && cobro.periodo && <p className="w-full text-sm text-muted-foreground">Se conserva en historial para que no se vuelva a generar.</p>}
  </article>;
}
