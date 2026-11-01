"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { TallerCampo } from "@/components/taller/TallerCampo";
import { TallerIcono } from "@/components/taller/TallerIcono";
import { TallerNavegacion } from "@/components/taller/TallerNavegacion";
import { EstadoTaller, numeroTaller, PlacaVehiculo, VacioTaller } from "@/components/taller/TallerVisuales";

type Vehiculo = { id: string; placa: string; vin: string | null; marca: string; modelo: string; anio: number | null; color: string | null; kilometraje: number; notas: string | null; version: number; contacto: { id: string; nombre: string; telefono: string | null; email: string | null }; ordenes: { id: string; numero: string; estado: string; createdAt: string; fallaReportada: string; total: string }[]; recordatorios: { id: string; tipo: string; proximoKm: number | null; proximaFecha: string | null; estado: string }[] };

export function TallerVehiculoDetalle({ vehiculo: inicial }: { vehiculo: Vehiculo }) {
  const router = useRouter();
  const [vehiculo, setVehiculo] = useState(inicial);
  const [busy, setBusy] = useState(false);
  async function guardar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const res = await fetch(`/api/taller/vehiculos/${vehiculo.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, version: vehiculo.version }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? "No se pudo actualizar");
      setVehiculo(data.vehiculo); toast("Ficha actualizada"); router.refresh();
    } catch (error) { toast(error instanceof Error ? error.message : "No se pudo actualizar", "error"); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <TallerNavegacion actual="vehiculos" titulo={`${vehiculo.marca} ${vehiculo.modelo}`} descripcion="Ficha del vehículo, propietario y actividad de servicio." acciones={<><Link className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted" href={`/clientes/${vehiculo.contacto.id}`}>Ficha del cliente</Link><Link className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90" href={`/taller/ordenes?vehiculoId=${vehiculo.id}`}><TallerIcono nombre="mas" className="h-4 w-4" />Crear orden</Link></>} />
    <section className="surface grid gap-5 p-4 sm:grid-cols-[minmax(0,1fr)_15rem] sm:p-6">
      <div className="space-y-4"><PlacaVehiculo placa={vehiculo.placa} grande /><div><h2 className="text-xl font-semibold">{vehiculo.marca} {vehiculo.modelo}{vehiculo.anio ? ` · ${vehiculo.anio}` : ""}</h2><p className="mt-1 text-sm text-muted-foreground">{vehiculo.color || "Color no registrado"}{vehiculo.vin ? ` · VIN ${vehiculo.vin}` : ""}</p></div><div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"><span className="inline-flex items-center gap-2 text-muted-foreground"><TallerIcono nombre="usuario" className="h-4 w-4" />{vehiculo.contacto.nombre}</span>{vehiculo.contacto.telefono ? <a className="inline-flex min-h-10 items-center gap-2 text-primary hover:underline" href={`tel:${vehiculo.contacto.telefono}`}><TallerIcono nombre="telefono" className="h-4 w-4" />{vehiculo.contacto.telefono}</a> : <span className="text-muted-foreground">Sin teléfono registrado</span>}</div></div>
      <div className="flex flex-col justify-center rounded-xl bg-primary/5 p-4"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kilometraje actual</span><strong className="tnum mt-1 text-3xl font-bold text-foreground">{numeroTaller(vehiculo.kilometraje)} <span className="text-base font-medium text-muted-foreground">km</span></strong><span className="mt-1 text-xs text-muted-foreground">Actualiza con la lectura del tablero</span></div>
    </section>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
      <section className="surface p-4 sm:p-5"><div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wide text-primary">Datos de la unidad</p><h2 className="mt-1 text-lg font-semibold">Editar ficha</h2></div>
    <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <TallerCampo label="Placa" name="placa" defaultValue={vehiculo.placa} required />
      <TallerCampo label="VIN" name="vin" defaultValue={vehiculo.vin ?? ""} />
      <TallerCampo label="Marca" name="marca" defaultValue={vehiculo.marca} required />
      <TallerCampo label="Modelo" name="modelo" defaultValue={vehiculo.modelo} required />
      <TallerCampo label="Año" name="anio" type="number" defaultValue={vehiculo.anio ?? ""} />
      <TallerCampo label="Color" name="color" defaultValue={vehiculo.color ?? ""} />
      <TallerCampo label="Kilometraje" name="kilometraje" type="number" min="0" defaultValue={vehiculo.kilometraje} required />
      <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium text-muted-foreground">Notas de servicio</span><textarea name="notas" className="min-h-24 w-full rounded-lg border border-input bg-background p-3 text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20" rows={3} defaultValue={vehiculo.notas ?? ""} /></label>
      <div className="flex items-end"><Boton className="min-h-11" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</Boton></div>
    </form>
      </section>
      <div className="space-y-5">
        <section className="surface p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Actividad</p><h2 className="mt-1 text-lg font-semibold">Historial de servicio</h2></div><span className="tnum rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{vehiculo.ordenes.length}</span></div>
          {vehiculo.ordenes.length ? <ol className="mt-5 space-y-0">{vehiculo.ordenes.map((orden, index) => <li key={orden.id} className="relative flex gap-3 pb-5 last:pb-0"><span className="relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><TallerIcono nombre="orden" className="h-4 w-4" /></span>{index < vehiculo.ordenes.length - 1 && <span className="absolute bottom-0 left-[17px] top-9 w-px bg-border" aria-hidden="true" />}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><Link className="min-h-9 font-semibold text-primary hover:underline" href={`/taller/ordenes/${orden.id}`}>Orden #{orden.numero}</Link><time className="text-xs text-muted-foreground">{new Date(orden.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Mexico_City" })}</time></div><p className="mt-0.5 truncate text-sm text-muted-foreground">{orden.fallaReportada}</p><div className="mt-2 flex flex-wrap items-center gap-2"><EstadoTaller estado={orden.estado} /><span className="tnum text-xs font-semibold text-foreground">{Number(orden.total).toLocaleString("es-MX", { style: "currency", currency: "MXN" })}</span></div></div></li>)}</ol> : <VacioTaller titulo="Aún no hay servicios" detalle="Las órdenes de esta unidad aparecerán aquí conforme avance su atención." accion={<Link className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" href={`/taller/ordenes?vehiculoId=${vehiculo.id}`}>Crear primera orden</Link>} />}
        </section>
        <section className="surface p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Seguimiento</p><h2 className="mt-1 text-lg font-semibold">Próximos recordatorios</h2></div><Link href="/taller/recordatorios" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary hover:underline">Ver todos<TallerIcono nombre="flecha" className="h-4 w-4" /></Link></div>
          {vehiculo.recordatorios.length ? <ul className="mt-3 divide-y divide-border/60">{vehiculo.recordatorios.slice(0, 3).map((r) => <li key={r.id} className="flex items-start gap-3 py-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning"><TallerIcono nombre="recordatorio" className="h-4 w-4" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">{r.tipo}</strong><span className="text-xs text-muted-foreground">{r.proximaFecha ? new Date(`${r.proximaFecha.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" }) : `A los ${numeroTaller(r.proximoKm ?? 0)} km`}</span></span></li>)}</ul> : <p className="mt-4 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">No hay recordatorios próximos para esta unidad.</p>}
        </section>
      </div>
    </div>
  </div>;
}
