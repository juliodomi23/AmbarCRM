"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo, EncabezadoPagina } from "@/components/ui";
import { toast } from "@/components/Toaster";

const columnas = ["recibido", "diagnostico", "esperando_aprobacion", "en_reparacion", "listo", "entregado", "cancelado"];
type Orden = { id: string; numero: string; estado: string; total: string; fallaReportada: string; vehiculo: { placa: string; marca: string; modelo: string; contacto: { nombre: string } } };
type Vehiculo = { id: string; placa: string; marca: string; modelo: string };
export function TallerOrdenes({ ordenes, vehiculos, vehiculoInicial }: { ordenes: Orden[]; vehiculos: Vehiculo[]; vehiculoInicial: string }) {
  const router = useRouter(); const [open, setOpen] = useState(Boolean(vehiculoInicial)); const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ vehiculoId: vehiculoInicial, kmEntrada: "0", fallaReportada: "", fechaPromesa: "" });
  async function crear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);
    try { const res = await fetch("/api/taller/ordenes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); toast("Orden creada"); setOpen(false); router.push(`/taller/ordenes/${data.orden.id}`); }
    catch (error) { toast(error instanceof Error ? error.message : "No se pudo crear la orden", "error"); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-7xl space-y-5 p-6">
    <EncabezadoPagina titulo="Órdenes de servicio" descripcion="Recepción, diagnóstico y avance de reparaciones." acciones={<><Link className="rounded-lg border px-3 py-2 text-sm" href="/taller">Vehículos</Link><Boton onClick={() => setOpen(!open)}>{open ? "Cerrar" : "Nueva orden"}</Boton></>} />
    {open && <form onSubmit={crear} className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm">Vehículo<select className="mt-1 w-full rounded-lg border p-2" required value={form.vehiculoId} onChange={(e) => setForm({ ...form, vehiculoId: e.target.value })}><option value="">Selecciona vehículo</option>{vehiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} · {v.marca} {v.modelo}</option>)}</select></label><Campo label="Km de entrada" type="number" min="0" value={form.kmEntrada} onChange={(e) => setForm({ ...form, kmEntrada: e.target.value })} required /><Campo label="Falla reportada" value={form.fallaReportada} onChange={(e) => setForm({ ...form, fallaReportada: e.target.value })} required /><Campo label="Promesa de entrega" type="datetime-local" value={form.fechaPromesa} onChange={(e) => setForm({ ...form, fechaPromesa: e.target.value })} /><div><Boton type="submit" disabled={busy}>{busy ? "Guardando…" : "Crear orden"}</Boton></div></form>}
    <div className="grid gap-4 xl:grid-cols-4">{columnas.map((estado) => <section key={estado} className="min-h-36 rounded-xl bg-slate-50 p-3"><h2 className="mb-3 font-semibold capitalize">{estado.replaceAll("_", " ")} <span className="text-sm font-normal text-slate-500">{ordenes.filter((o) => o.estado === estado).length}</span></h2><div className="space-y-2">{ordenes.filter((o) => o.estado === estado).map((o) => <Link key={o.id} href={`/taller/ordenes/${o.id}`} className="block rounded-lg border bg-white p-3 hover:border-amber-400"><p className="font-semibold">Orden #{o.numero} · {o.vehiculo.placa}</p><p className="text-sm text-slate-600">{o.vehiculo.marca} {o.vehiculo.modelo} · {o.vehiculo.contacto.nombre}</p><p className="mt-1 line-clamp-2 text-sm">{o.fallaReportada}</p></Link>)}</div></section>)}</div>
  </main>;
}
