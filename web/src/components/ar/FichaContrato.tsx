import Link from "next/link";
import type { Contrato } from "@prisma/client";
import { estiloAR, contratoVisible } from "@/lib/ar-vistas";
import type { CampoFormulario } from "@/components/modulos/FormularioModulo";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { EstadoAR } from "./EstadoAR";
import { NuevoCobro } from "./NuevoCobro";
import { AccionesContrato } from "./AccionesContrato";

export function FichaContrato({ contrato,campos,hoy,esAdmin }: {contrato:Contrato & {contacto:{nombre:string}};campos:CampoFormulario[];hoy:string;esAdmin:boolean}) {
  const cerrado = !contratoVisible(contrato.estado);
  const valores = Object.fromEntries(campos.map(c => { const valor = contrato[c.nombre as keyof Contrato];return [c.nombre,valor instanceof Date ? valor.toISOString().slice(0,10) : String(valor ?? "")]; }));
  return <article className={`surface min-w-0 !border-l-4 p-5 ${estiloAR(contrato.estado).borde} ${cerrado ? "!bg-slate-50 dark:!bg-slate-900" : ""}`} data-contrato-id={String(contrato.id)}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><Link href={`/contratos/${contrato.id}`} className="break-words text-xl font-semibold hover:underline">{contrato.contacto.nombre}</Link><p className="mt-1 text-sm text-muted-foreground">{contrato.tipo.replaceAll("_"," ")}</p></div><EstadoAR estado={contrato.estado} /></div>
    <div className="my-4 flex flex-wrap items-end justify-between gap-3"><p className="text-3xl font-bold tnum">{contrato.mensualidad === null ? <span className="text-lg">Mensualidad por definir</span> : `$${contrato.mensualidad.toFixed(2)}`}<span className="ml-1 text-xs font-normal text-muted-foreground">{contrato.mensualidad !== null ? "MXN / mes" : ""}</span></p><p className={`rounded-lg px-3 py-2 text-sm font-medium ${contrato.diaCobro ? "bg-muted" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>{contrato.diaCobro ? `Cobra el día ${contrato.diaCobro}` : "Sin día de cobro"}</p></div>
    <div className="flex flex-wrap items-center gap-3 border-t pt-4"><NuevoCobro contratoId={String(contrato.id)} /><Link className="text-sm font-medium text-primary hover:underline" href={`/contratos/${contrato.id}`}>Ver contrato y cobros</Link><FormularioModulo discreto boton="Editar contrato" titulo="Editar contrato" endpoint={`/api/contratos/${contrato.id}`} valores={valores} campos={campos} /><AccionesContrato id={String(contrato.id)} estado={contrato.estado} hoy={hoy} esAdmin={esAdmin} /></div>
  </article>;
}
