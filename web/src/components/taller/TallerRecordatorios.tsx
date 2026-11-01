"use client";

import Link from "next/link";
import { Boton } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { TallerIcono } from "@/components/taller/TallerIcono";
import { TallerNavegacion } from "@/components/taller/TallerNavegacion";
import { numeroTaller, VacioTaller } from "@/components/taller/TallerVisuales";

type Recordatorio = { id: string; tipo: string; proximoKm: number | null; proximaFecha: string | null; vehiculo: { id: string; placa: string; marca: string; modelo: string; kilometraje: number; contacto: { nombre: string; telefono: string | null } } };
type Grupo = "vencidos" | "proximos" | "adelante";

function fechaLocal(value: string) { return new Date(`${value.slice(0, 10)}T12:00:00`); }
function diasHasta(value: string) { const inicio = new Date(); inicio.setHours(0, 0, 0, 0); const fecha = fechaLocal(value); fecha.setHours(0, 0, 0, 0); return Math.round((fecha.getTime() - inicio.getTime()) / 86_400_000); }
function grupoRecordatorio(recordatorio: Recordatorio): Grupo {
  const kmRestantes = recordatorio.proximoKm === null ? null : recordatorio.proximoKm - recordatorio.vehiculo.kilometraje;
  const dias = recordatorio.proximaFecha ? diasHasta(recordatorio.proximaFecha) : null;
  if ((dias !== null && dias < 0) || (kmRestantes !== null && kmRestantes <= 0)) return "vencidos";
  if ((dias !== null && dias <= 30) || (kmRestantes !== null && kmRestantes <= 1000)) return "proximos";
  return "adelante";
}

function descripcionPlazo(recordatorio: Recordatorio) {
  const fecha = recordatorio.proximaFecha ? fechaLocal(recordatorio.proximaFecha).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : null;
  const kilometraje = recordatorio.proximoKm !== null ? `${numeroTaller(recordatorio.proximoKm)} km` : null;
  return fecha && kilometraje ? `${fecha} · ${kilometraje}` : fecha ? fecha : kilometraje ? `Al llegar a ${kilometraje}` : "Sin fecha ni kilometraje";
}

function TarjetaRecordatorio({ recordatorio, grupo }: { recordatorio: Recordatorio; grupo: Grupo }) {
  const { vehiculo } = recordatorio;
  async function avisar() {
    if (!vehiculo.contacto.telefono) return;
    try { await navigator.clipboard.writeText(vehiculo.contacto.telefono); toast("Teléfono copiado. Contacta al cliente manualmente."); }
    catch { toast("No se pudo copiar el teléfono", "error"); }
  }
  const estado = grupo === "vencidos" ? { nombre: "Vencido", clase: "bg-destructive/10 text-destructive", icono: "reloj" as const } : grupo === "proximos" ? { nombre: "Próximo", clase: "bg-warning/10 text-warning", icono: "calendario" as const } : { nombre: "Más adelante", clase: "bg-info/10 text-info", icono: "calendario" as const };
  return <article className="surface surface-interactiva flex min-h-48 flex-col justify-between gap-4 p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><TallerIcono nombre="recordatorio" className="h-5 w-5"/></span><span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${estado.clase}`}><TallerIcono nombre={estado.icono} className="h-4 w-4"/>{estado.nombre}</span></div>
    <div className="min-w-0"><h3 className="truncate text-base font-semibold">{recordatorio.tipo}</h3><div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold tracking-wide text-foreground">{vehiculo.placa}</span><span className="truncate text-sm text-muted-foreground">{vehiculo.marca} {vehiculo.modelo}</span></div><p className="mt-1 truncate text-sm text-muted-foreground">{vehiculo.contacto.nombre}</p><p className="tnum mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold"><TallerIcono nombre="calendario" className="h-4 w-4 text-primary"/>{descripcionPlazo(recordatorio)}</p>{recordatorio.proximoKm !== null && <p className="mt-1 text-xs text-muted-foreground">Lectura actual: {numeroTaller(vehiculo.kilometraje)} km</p>}</div>
    <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3"><Link className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted" href={`/taller/vehiculos/${vehiculo.id}`}>Abrir vehículo</Link><Boton className="min-h-10 flex-1" variante="ghost" disabled={!vehiculo.contacto.telefono} title={vehiculo.contacto.telefono ? "Copia el teléfono para contactar manualmente" : "Este cliente no tiene teléfono registrado"} onClick={() => void avisar()}>Avisar al cliente</Boton></div>
  </article>;
}

export function TallerRecordatorios({ recordatorios, esAdmin = false }: { recordatorios: Recordatorio[]; esAdmin?: boolean }) {
  const grupos: { id: Grupo; titulo: string; descripcion: string; icono: "reloj" | "calendario"; clase: string }[] = [
    { id: "vencidos", titulo: "Vencidos", descripcion: "La fecha o kilometraje programado ya pasó.", icono: "reloj", clase: "text-destructive" },
    { id: "proximos", titulo: "Próximos 30 días", descripcion: "Incluye los servicios que se acercan por fecha o kilometraje.", icono: "calendario", clase: "text-warning" },
    { id: "adelante", titulo: "Más adelante", descripcion: "Servicios con mayor anticipación.", icono: "calendario", clase: "text-info" },
  ];
  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6"><TallerNavegacion actual="recordatorios" titulo="Recordatorios de servicio" descripcion="Seguimiento manual por fecha y kilometraje." acciones={<Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted" href="/taller/ordenes"><TallerIcono nombre="orden" className="h-4 w-4"/>Órdenes</Link>} esAdmin={esAdmin} />
    <div className="grid gap-3 sm:grid-cols-3">{grupos.map((grupo) => { const cantidad = recordatorios.filter((r) => grupoRecordatorio(r) === grupo.id).length; return <div key={grupo.id} className="surface flex items-center gap-3 p-4"><span className={`grid h-10 w-10 place-items-center rounded-xl ${grupo.id === "vencidos" ? "bg-destructive/10" : grupo.id === "proximos" ? "bg-warning/10" : "bg-info/10"} ${grupo.clase}`}><TallerIcono nombre={grupo.icono} className="h-5 w-5"/></span><div><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{grupo.titulo}</span><strong className="tnum block text-xl">{numeroTaller(cantidad)}</strong></div></div>; })}</div>
    <div className="space-y-7">{grupos.map((grupo) => { const items = recordatorios.filter((r) => grupoRecordatorio(r) === grupo.id); return <section key={grupo.id} className="space-y-3" aria-labelledby={`recordatorios-${grupo.id}`}><header className="flex flex-wrap items-end justify-between gap-3"><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${grupo.id === "vencidos" ? "bg-destructive/10" : grupo.id === "proximos" ? "bg-warning/10" : "bg-info/10"} ${grupo.clase}`}><TallerIcono nombre={grupo.icono} className="h-5 w-5"/></span><div><h2 id={`recordatorios-${grupo.id}`} className="text-lg font-semibold">{grupo.titulo}<span className="tnum ml-2 rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground">{items.length}</span></h2><p className="text-xs text-muted-foreground">{grupo.descripcion}</p></div></div></header>{items.length ? <div className="stagger grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((recordatorio) => <TarjetaRecordatorio key={recordatorio.id} recordatorio={recordatorio} grupo={grupo.id}/>)}</div> : <div className="surface flex min-h-20 items-center gap-3 px-4 py-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground"><TallerIcono nombre="check" className="h-4 w-4"/></span><p className="text-sm text-muted-foreground">{grupo.id === "vencidos" ? "No hay servicios vencidos." : grupo.id === "proximos" ? "No hay servicios para los próximos 30 días." : "No hay servicios programados más adelante."}</p></div>}</section>; })}</div>
    {!recordatorios.length && <VacioTaller titulo="Sin recordatorios pendientes" detalle="Al crear un recordatorio de servicio para un vehículo, aparecerá aquí para dar seguimiento manual." />}
  </div>;
}
