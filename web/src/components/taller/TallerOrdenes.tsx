"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { TallerCampo } from "@/components/taller/TallerCampo";
import { TallerIcono } from "@/components/taller/TallerIcono";
import { TallerNavegacion } from "@/components/taller/TallerNavegacion";
import { EstadoTaller, monedaTaller, nombreEstadoTaller, numeroTaller, PlacaVehiculo, VacioTaller } from "@/components/taller/TallerVisuales";

const columnas = ["recibido", "diagnostico", "esperando_aprobacion", "en_reparacion", "listo", "entregado", "cancelado"];
type Orden = { id: string; numero: string; estado: string; total: string; fallaReportada: string; fechaPromesa: string | null; mecanicoId: string | null; vehiculo: { placa: string; marca: string; modelo: string; contacto: { nombre: string } } };
type Vehiculo = { id: string; placa: string; marca: string; modelo: string; kilometraje: number };
type Mecanico = { id: string; nombre: string; puesto: string };

const tonosColumna: Record<string, string> = {
  recibido: "border-primary/20 bg-primary/5",
  diagnostico: "border-info/25 bg-info/5",
  esperando_aprobacion: "border-warning/30 bg-warning/5",
  en_reparacion: "border-primary/25 bg-primary/5",
  listo: "border-success/25 bg-success/5",
  entregado: "border-success/20 bg-success/5",
  cancelado: "border-border bg-muted/50",
};
const puntosColumna: Record<string, string> = { recibido: "bg-primary", diagnostico: "bg-info", esperando_aprobacion: "bg-warning", en_reparacion: "bg-primary", listo: "bg-success", entregado: "bg-success", cancelado: "bg-muted-foreground" };

function fechaPromesa(fecha: string | null) {
  if (!fecha) return { texto: "Sin fecha promesa", tono: "text-muted-foreground", icono: "calendario" as const };
  const dia = new Date(fecha); const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const diaLocal = new Date(dia); diaLocal.setHours(0, 0, 0, 0);
  const dias = Math.round((diaLocal.getTime() - hoy.getTime()) / 86_400_000);
  return { texto: dias < 0 ? `Vencida · ${dia.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}` : dias === 0 ? "Vence hoy" : dia.toLocaleDateString("es-MX", { day: "numeric", month: "short" }), tono: dias < 0 ? "text-destructive" : dias === 0 ? "text-warning" : "text-muted-foreground", icono: "calendario" as const };
}

function iniciales(nombre: string) { return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]).join("").toLocaleUpperCase("es-MX"); }

export function TallerOrdenes({ ordenes, vehiculos, mecanicos, vehiculoInicial }: { ordenes: Orden[]; vehiculos: Vehiculo[]; mecanicos: Mecanico[]; vehiculoInicial: string }) {
  const router = useRouter(); const [open, setOpen] = useState(Boolean(vehiculoInicial)); const [busy, setBusy] = useState(false); const [vista, setVista] = useState<"tablero" | "lista">("tablero");
  const [form, setForm] = useState({ vehiculoId: vehiculoInicial, kmEntrada: String(vehiculos.find((v) => v.id === vehiculoInicial)?.kilometraje ?? 0), fallaReportada: "", fechaPromesa: "" });
  const mecanicoPorId = useMemo(() => new Map(mecanicos.map((m) => [m.id, m])), [mecanicos]);

  async function crear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);
    try { const res = await fetch("/api/taller/ordenes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); toast("Orden creada"); setOpen(false); router.push(`/taller/ordenes/${data.orden.id}`); }
    catch (error) { toast(error instanceof Error ? error.message : "No se pudo crear la orden", "error"); } finally { setBusy(false); }
  }

  function tarjeta(o: Orden) {
    const mecanico = o.mecanicoId ? mecanicoPorId.get(o.mecanicoId) : undefined;
    const promesa = fechaPromesa(o.fechaPromesa);
    return <Link key={o.id} href={`/taller/ordenes/${o.id}`} className="surface surface-interactiva block min-h-44 rounded-xl p-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
      <div className="flex items-center justify-between gap-2"><span className="tnum text-sm font-bold text-foreground">#{o.numero}</span><PlacaVehiculo placa={o.vehiculo.placa} /></div>
      <p className="mt-3 truncate text-sm font-semibold text-foreground">{o.vehiculo.marca} {o.vehiculo.modelo}</p>
      <p className="truncate text-xs text-muted-foreground">{o.vehiculo.contacto.nombre}</p>
      <p className="mt-2 truncate text-sm text-foreground" title={o.fallaReportada}>{o.fallaReportada}</p>
      <div className="mt-3 flex min-h-8 items-center justify-between gap-2 border-t border-border/60 pt-2.5">
        {mecanico ? <span className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary" aria-label={`Mecánico ${mecanico.nombre}`}>{iniciales(mecanico.nombre)}</span><span className="truncate">{mecanico.nombre}</span></span> : <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><TallerIcono nombre="usuario" className="h-4 w-4" />Sin asignar</span>}
        <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${promesa.tono}`}><TallerIcono nombre={promesa.icono} className="h-3.5 w-3.5" />{promesa.texto}</span>
      </div>
      <p className="tnum mt-2 text-right text-sm font-bold text-foreground">{monedaTaller(o.total)}</p>
    </Link>;
  }

  return <div className="mx-auto max-w-[88rem] space-y-6 p-4 sm:p-6">
    <TallerNavegacion actual="ordenes" titulo="Órdenes de servicio" descripcion="Recepción, diagnóstico y avance de cada reparación." acciones={<Boton className="min-h-11" onClick={() => setOpen(!open)}><span className="inline-flex items-center gap-2"><TallerIcono nombre="mas" className="h-4 w-4" />{open ? "Cerrar formulario" : "Nueva orden"}</span></Boton>} />
    {open && <form onSubmit={crear} className="surface animate-fade-up grid gap-4 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
      <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground">Vehículo</span><select className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" required value={form.vehiculoId} onChange={(e) => { const elegido = vehiculos.find((v) => v.id === e.target.value); setForm({ ...form, vehiculoId: e.target.value, kmEntrada: elegido ? String(elegido.kilometraje) : form.kmEntrada }); }}><option value="">Selecciona vehículo</option>{vehiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} · {v.marca} {v.modelo}</option>)}</select></label>
      <TallerCampo label="Km de entrada" type="number" min="0" value={form.kmEntrada} onChange={(e) => setForm({ ...form, kmEntrada: e.target.value })} required />
      <TallerCampo label="Falla reportada" value={form.fallaReportada} onChange={(e) => setForm({ ...form, fallaReportada: e.target.value })} required />
      <TallerCampo label="Promesa de entrega" type="datetime-local" value={form.fechaPromesa} onChange={(e) => setForm({ ...form, fechaPromesa: e.target.value })} />
      <div className="sm:col-span-2 xl:col-span-4"><Boton className="min-h-11" type="submit" disabled={busy}>{busy ? "Guardando…" : "Crear orden"}</Boton></div>
    </form>}
    <div className="surface flex flex-col justify-between gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
      <div><p className="text-sm font-semibold text-foreground">Flujo de trabajo</p><p className="text-xs text-muted-foreground">{ordenes.length} {ordenes.length === 1 ? "orden activa o cerrada" : "órdenes en el taller"}</p></div>
      <div className="inline-flex min-h-11 self-start rounded-lg bg-muted p-1 sm:self-auto" role="group" aria-label="Vista de órdenes">
        <button type="button" aria-pressed={vista === "tablero"} onClick={() => setVista("tablero")} className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold ${vista === "tablero" ? "bg-card text-primary shadow-soft" : "text-muted-foreground hover:text-foreground"}`}><TallerIcono nombre="orden" className="h-4 w-4" />Tablero</button>
        <button type="button" aria-pressed={vista === "lista"} onClick={() => setVista("lista")} className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold ${vista === "lista" ? "bg-card text-primary shadow-soft" : "text-muted-foreground hover:text-foreground"}`}><TallerIcono nombre="menu" className="h-4 w-4" />Lista</button>
      </div>
    </div>
    {!ordenes.length ? <VacioTaller titulo="Todavía no hay órdenes" detalle="Registra una recepción para dar seguimiento al diagnóstico, aprobación, reparación y entrega." accion={<Boton className="mt-2 min-h-11" onClick={() => setOpen(true)}>Crear primera orden</Boton>} /> : vista === "tablero" ?
      <div aria-label="Tablero de órdenes por estado" className="grid snap-x auto-cols-[minmax(17rem,19rem)] grid-flow-col gap-3 overflow-x-auto pb-4 xl:auto-cols-[minmax(15rem,1fr)]">
        {columnas.map((estado) => {
          const items = ordenes.filter((o) => o.estado === estado);
          return <section key={estado} aria-label={`${nombreEstadoTaller(estado)}: ${items.length}`} className={`min-h-64 snap-start rounded-2xl border p-2.5 ${tonosColumna[estado]}`}>
            <header className="mb-3 flex min-h-10 items-center justify-between gap-2 px-1"><div className="flex min-w-0 items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${puntosColumna[estado]}`} aria-hidden="true"/><h2 className="truncate text-sm font-semibold">{nombreEstadoTaller(estado)}</h2></div><span className="tnum grid h-7 min-w-7 place-items-center rounded-full bg-card px-2 text-xs font-bold text-muted-foreground">{items.length}</span></header>
            <div className="space-y-2.5">{items.length ? items.map(tarjeta) : <p className="rounded-xl border border-dashed border-border/80 bg-card/60 px-3 py-5 text-center text-xs text-muted-foreground">Las órdenes en este paso aparecerán aquí.</p>}</div>
          </section>;
        })}
      </div> : <div className="surface overflow-hidden"><div className="overflow-x-auto"><table className="tabla"><thead><tr><th>Orden</th><th>Vehículo</th><th>Cliente</th><th>Estado</th><th>Mecánico</th><th>Promesa</th><th className="text-right">Total</th><th><span className="sr-only">Abrir</span></th></tr></thead><tbody>{ordenes.map((o) => { const mecanico = o.mecanicoId ? mecanicoPorId.get(o.mecanicoId) : undefined; const promesa = fechaPromesa(o.fechaPromesa); return <tr key={o.id} className="fila-lista"><td className="tnum font-bold">#{o.numero}</td><td><PlacaVehiculo placa={o.vehiculo.placa} /></td><td className="min-w-40">{o.vehiculo.contacto.nombre}<span className="block text-xs text-muted-foreground">{o.vehiculo.marca} {o.vehiculo.modelo}</span></td><td><EstadoTaller estado={o.estado} /></td><td>{mecanico?.nombre ?? "Sin asignar"}</td><td><span className={`inline-flex min-h-8 items-center gap-1 text-xs font-semibold ${promesa.tono}`}><TallerIcono nombre="calendario" className="h-3.5 w-3.5" />{promesa.texto}</span></td><td className="tnum text-right font-semibold">{monedaTaller(o.total)}</td><td><Link href={`/taller/ordenes/${o.id}`} aria-label={`Abrir orden ${o.numero}`} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-primary/5">Abrir<TallerIcono nombre="flecha" className="h-4 w-4" /></Link></td></tr>; })}</tbody></table></div></div>}
  </div>;
}
