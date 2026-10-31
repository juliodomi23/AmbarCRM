"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo, EncabezadoPagina } from "@/components/ui";
import { toast } from "@/components/Toaster";

type Vehiculo = { id: string; placa: string; vin: string | null; marca: string; modelo: string; anio: number | null; color: string | null; kilometraje: number; notas: string | null; version: number; contacto: { id: string; nombre: string; telefono: string | null; email: string | null }; ordenes: { id: string; numero: number; estado: string; createdAt: string }[] };

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
  return <main className="mx-auto max-w-5xl space-y-5 p-6">
    <Link className="text-sm text-amber-800 hover:underline" href="/taller">← Volver al taller</Link>
    <EncabezadoPagina titulo={`${vehiculo.marca} ${vehiculo.modelo}`} descripcion={`Ficha de ${vehiculo.placa}`} acciones={<><Link className="rounded-lg border px-3 py-2 text-sm" href={`/clientes/${vehiculo.contacto.id}`}>Abrir ficha del cliente</Link><Link className="rounded-lg bg-amber-700 px-3 py-2 text-sm text-white" href={`/taller/ordenes?vehiculoId=${vehiculo.id}`}>Crear orden</Link></>} />
    <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Propietario</h2><p className="mt-1">{vehiculo.contacto.nombre}</p><p className="text-sm text-slate-600">{vehiculo.contacto.telefono ?? "Sin teléfono"}{vehiculo.contacto.email ? ` · ${vehiculo.contacto.email}` : ""}</p></section>
    <form onSubmit={guardar} className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
      <Campo label="Placa" name="placa" defaultValue={vehiculo.placa} required />
      <Campo label="VIN" name="vin" defaultValue={vehiculo.vin ?? ""} />
      <Campo label="Marca" name="marca" defaultValue={vehiculo.marca} required />
      <Campo label="Modelo" name="modelo" defaultValue={vehiculo.modelo} required />
      <Campo label="Año" name="anio" type="number" defaultValue={vehiculo.anio ?? ""} />
      <Campo label="Color" name="color" defaultValue={vehiculo.color ?? ""} />
      <Campo label="Kilometraje" name="kilometraje" type="number" min="0" defaultValue={vehiculo.kilometraje} required />
      <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium text-slate-600">Notas</span><textarea name="notas" className="w-full rounded-lg border p-2" rows={3} defaultValue={vehiculo.notas ?? ""} /></label>
      <div className="flex items-end"><Boton type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</Boton></div>
    </form>
    <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Historial de órdenes</h2>{vehiculo.ordenes.length ? <ul className="mt-2 divide-y">{vehiculo.ordenes.map((orden) => <li key={orden.id} className="py-2"><Link className="font-medium text-amber-800 hover:underline" href={`/taller/ordenes/${orden.id}`}>Orden #{orden.numero}</Link><span className="ml-2 text-sm capitalize text-slate-600">{orden.estado.replaceAll("_", " ")}</span><span className="ml-2 text-sm text-slate-500">{new Date(orden.createdAt).toLocaleDateString("es-MX")}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Aún no hay órdenes de servicio.</p>}</section>
  </main>;
}
