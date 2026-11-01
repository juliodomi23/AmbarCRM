"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { TallerCampo } from "@/components/taller/TallerCampo";
import { TallerIcono } from "@/components/taller/TallerIcono";
import { TallerNavegacion } from "@/components/taller/TallerNavegacion";
import { EstadoTaller, numeroTaller, PlacaVehiculo, VacioTaller } from "@/components/taller/TallerVisuales";

type Contacto = { id: string; nombre: string; telefono: string | null };
type Vehiculo = { id: string; placa: string; vin: string | null; marca: string; modelo: string; anio: number | null; color: string | null; kilometraje: number; version: number; contacto: Contacto; ordenes?: { estado: string; createdAt: string }[] };

export function TallerVehiculos({ iniciales, contactos, contactoInicial = "", esAdmin = false }: { iniciales: Vehiculo[]; contactos: Contacto[]; contactoInicial?: string; esAdmin?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [contactoFiltro, setContactoFiltro] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ contactoId: contactoInicial, placa: "", vin: "", marca: "", modelo: "", anio: "", color: "", kilometraje: "0", notas: "" });
  const lista = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("es-MX");
    return iniciales.filter((v) => (!contactoFiltro || v.contacto.id === contactoFiltro) && `${v.placa} ${v.marca} ${v.modelo} ${v.contacto.nombre}`.toLocaleLowerCase("es-MX").includes(needle));
  }, [iniciales, q, contactoFiltro]);
  async function crear(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      const res = await fetch("/api/taller/vehiculos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el vehículo");
      toast("Vehículo registrado"); setOpen(false); setForm({ contactoId: contactoInicial, placa: "", vin: "", marca: "", modelo: "", anio: "", color: "", kilometraje: "0", notas: "" }); router.refresh();
    } catch (error) { toast(error instanceof Error ? error.message : "No se pudo guardar el vehículo", "error"); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <TallerNavegacion actual="vehiculos" titulo="Vehículos" descripcion="La ficha de servicio de cada unidad y su historial en el taller." acciones={<Boton className="min-h-11" onClick={() => setOpen(!open)}><span className="inline-flex items-center gap-2"><TallerIcono nombre="mas" className="h-4 w-4" />{open ? "Cerrar formulario" : "Registrar vehículo"}</span></Boton>} esAdmin={esAdmin} />
    {open && <form onSubmit={crear} className="surface animate-fade-up grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
      <label className="block space-y-1 text-sm"><span className="font-medium text-muted-foreground">Cliente propietario</span><select className="min-h-11 w-full rounded-lg border border-input bg-card px-3 text-foreground" required value={form.contactoId} onChange={(e) => setForm({ ...form, contactoId: e.target.value })}><option value="">Selecciona un cliente</option>{contactos.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.telefono ? ` · ${c.telefono}` : ""}</option>)}</select></label>
      {([["placa", "Placa"], ["marca", "Marca"], ["modelo", "Modelo"], ["anio", "Año"], ["vin", "VIN"], ["color", "Color"], ["kilometraje", "Kilometraje"]] as const).map(([key, label]) => <TallerCampo key={key} label={label} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required={key === "placa" || key === "marca" || key === "modelo"} />)}
      <div className="flex items-end"><Boton className="min-h-11 w-full sm:w-auto" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar vehículo"}</Boton></div>
    </form>}
    <section className="surface space-y-4 p-4 sm:p-5" aria-label="Buscar vehículos">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
        <label className="relative block"><span className="sr-only">Buscar por placa, cliente o marca</span><TallerIcono nombre="busqueda" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" /><input className="min-h-12 w-full rounded-lg border border-input bg-background pl-11 pr-3 text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="Buscar placa, cliente o vehículo" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="block space-y-1 text-xs font-medium text-muted-foreground"><span>Filtrar por cliente</span><select className="min-h-12 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" value={contactoFiltro} onChange={(e) => setContactoFiltro(e.target.value)}><option value="">Todos los clientes</option>{contactos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      </div>
      <div className="flex items-center justify-between text-sm"><p className="text-muted-foreground">{lista.length} {lista.length === 1 ? "vehículo" : "vehículos"}</p><p className="hidden text-xs text-muted-foreground sm:block">Selecciona una unidad para abrir su ficha</p></div>
    </section>
    {lista.length ? <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{lista.map((v) => {
      const ultimoEstado = v.ordenes?.[0]?.estado;
      return <Link key={v.id} href={`/taller/vehiculos/${v.id}`} className="surface surface-interactiva group flex min-h-48 flex-col justify-between gap-4 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:p-5">
        <div className="flex items-start justify-between gap-3"><PlacaVehiculo placa={v.placa} /><span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{v.color || "Unidad de servicio"}</span></div>
        <div><h2 className="text-lg font-semibold text-foreground">{v.marca} {v.modelo}{v.anio ? ` · ${v.anio}` : ""}</h2><p className="mt-1 text-sm text-muted-foreground">{v.contacto.nombre}</p><p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground"><span className="tnum font-semibold text-foreground">{numeroTaller(v.kilometraje)} km</span><span aria-hidden="true">·</span><span>{v.ordenes?.length ? "Último servicio" : "Sin servicios"}</span></p></div>
        <div className="flex items-center justify-between border-t border-border/60 pt-3"><EstadoTaller estado={ultimoEstado ?? "sin_servicios"} /><span className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary">Abrir ficha<TallerIcono nombre="flecha" className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></div>
      </Link>;
    })}</div> : <VacioTaller titulo={q || contactoFiltro ? "No encontramos unidades" : "Empieza con el primer vehículo"} detalle={q || contactoFiltro ? "Prueba con otra placa o selecciona un cliente diferente." : "Registra un vehículo para abrir su ficha e iniciar su historial de servicio."} accion={!q && !contactoFiltro ? <Boton className="mt-2 min-h-11" onClick={() => setOpen(true)}>Registrar vehículo</Boton> : undefined} />}
  </div>;
}
