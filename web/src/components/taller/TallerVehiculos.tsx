"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo, EncabezadoPagina } from "@/components/ui";
import { toast } from "@/components/Toaster";

type Contacto = { id: string; nombre: string; telefono: string | null };
type Vehiculo = { id: string; placa: string; vin: string | null; marca: string; modelo: string; anio: number | null; color: string | null; kilometraje: number; version: number; contacto: Contacto };

export function TallerVehiculos({ iniciales, contactos, contactoInicial = "" }: { iniciales: Vehiculo[]; contactos: Contacto[]; contactoInicial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ contactoId: contactoInicial, placa: "", vin: "", marca: "", modelo: "", anio: "", color: "", kilometraje: "0", notas: "" });
  const lista = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("es-MX");
    return iniciales.filter((v) => `${v.placa} ${v.marca} ${v.modelo} ${v.contacto.nombre}`.toLocaleLowerCase("es-MX").includes(needle));
  }, [iniciales, q]);
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
  return <main className="mx-auto max-w-6xl space-y-5 p-6">
    <EncabezadoPagina titulo="Taller mecánico" descripcion="Vehículos de tus clientes y su historial de servicio." acciones={<Boton onClick={() => setOpen(!open)}>{open ? "Cerrar" : "Agregar vehículo"}</Boton>} />
    {open && <form onSubmit={crear} className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-sm">Cliente<select className="mt-1 w-full rounded-lg border p-2" required value={form.contactoId} onChange={(e) => setForm({ ...form, contactoId: e.target.value })}><option value="">Selecciona un cliente</option>{contactos.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.telefono ? ` · ${c.telefono}` : ""}</option>)}</select></label>
      {([["placa", "Placa"], ["marca", "Marca"], ["modelo", "Modelo"], ["anio", "Año"], ["vin", "VIN"], ["color", "Color"], ["kilometraje", "Kilometraje"]] as const).map(([key, label]) => <Campo key={key} label={label} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required={key === "placa" || key === "marca" || key === "modelo"} />)}
      <div className="flex items-end"><Boton type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar vehículo"}</Boton></div>
    </form>}
    <Campo label="Buscar por placa, cliente o marca" value={q} onChange={(e) => setQ(e.target.value)} />
    <div className="overflow-hidden rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-3">Placa</th><th className="p-3">Vehículo</th><th className="p-3">Cliente</th><th className="p-3">Kilometraje</th></tr></thead><tbody>{lista.map((v) => <tr key={v.id} className="border-t"><td className="p-3 font-semibold"><Link className="text-amber-800 hover:underline" href={`/taller/vehiculos/${v.id}`}>{v.placa}</Link></td><td className="p-3">{v.marca} {v.modelo}{v.anio ? ` ${v.anio}` : ""}</td><td className="p-3"><Link className="hover:underline" href={`/clientes/${v.contacto.id}`}>{v.contacto.nombre}</Link></td><td className="p-3">{v.kilometraje.toLocaleString("es-MX")} km</td></tr>)}{lista.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-500">No se encontraron vehículos.</td></tr>}</tbody></table></div>
  </main>;
}
