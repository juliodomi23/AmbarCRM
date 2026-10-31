"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, EncabezadoPagina } from "@/components/ui";
import { toast } from "@/components/Toaster";

type Concepto = { tipo: string; descripcion: string; cantidad: string; precioUnitario: string };
type Orden = { id: string; numero: string; estado: string; version: number; kmEntrada: number; fallaReportada: string; diagnostico: string; total: string; fechaPromesa: string | null; conceptos: Concepto[]; cambios: { estado: string; userId: string; creadoAt: string }[]; vehiculo: { id: string; placa: string; marca: string; modelo: string; contacto: { nombre: string } } };
const siguientes: Record<string, string[]> = { recibido: ["diagnostico", "cancelado"], diagnostico: ["esperando_aprobacion", "en_reparacion", "cancelado"], esperando_aprobacion: ["diagnostico", "en_reparacion", "cancelado"], en_reparacion: ["listo", "cancelado"], listo: ["entregado", "en_reparacion"], entregado: [], cancelado: [] };
export function TallerOrdenDetalle({ orden: inicial }: { orden: Orden }) {
  const router = useRouter(); const [orden, setOrden] = useState(inicial); const [diagnostico, setDiagnostico] = useState(inicial.diagnostico); const [conceptos, setConceptos] = useState(inicial.conceptos.map((c) => ({ ...c }))); const [busy, setBusy] = useState(false);
  async function guardar(extra: Record<string, unknown> = {}) {
    setBusy(true);
    try { const res = await fetch(`/api/taller/ordenes/${orden.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: orden.version, diagnostico, conceptos, ...extra }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); setOrden(data.orden); setDiagnostico(data.orden.diagnostico); setConceptos(data.orden.conceptos); toast("Orden actualizada"); router.refresh(); }
    catch (error) { toast(error instanceof Error ? error.message : "No se pudo actualizar", "error"); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-5xl space-y-5 p-6"><Link className="text-sm text-amber-800 hover:underline" href="/taller/ordenes">← Tablero de órdenes</Link><EncabezadoPagina titulo={`Orden #${orden.numero}`} descripcion={`${orden.vehiculo.placa} · ${orden.vehiculo.marca} ${orden.vehiculo.modelo} · ${orden.vehiculo.contacto.nombre}`} acciones={<span className="rounded-full bg-amber-100 px-3 py-1 text-sm capitalize">{orden.estado.replaceAll("_", " ")}</span>} />
    <section className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-3"><p><span className="text-sm text-slate-500">Km de entrada</span><br />{orden.kmEntrada.toLocaleString("es-MX")} km</p><p className="sm:col-span-2"><span className="text-sm text-slate-500">Falla reportada</span><br />{orden.fallaReportada}</p></section>
    <section className="space-y-3 rounded-xl border bg-white p-4"><h2 className="font-semibold">Diagnóstico y conceptos</h2><label className="block text-sm">Diagnóstico<textarea value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} className="mt-1 w-full rounded-lg border p-2" rows={3} /></label>
      {conceptos.map((c, i) => <div key={i} className="grid gap-2 sm:grid-cols-4"><select className="rounded-lg border p-2" value={c.tipo} onChange={(e) => setConceptos(conceptos.map((x, n) => n === i ? { ...x, tipo: e.target.value } : x))}><option value="mano_obra">Mano de obra</option><option value="refaccion">Refacción</option></select><input className="rounded-lg border p-2" aria-label="Descripción" placeholder="Descripción" value={c.descripcion} onChange={(e) => setConceptos(conceptos.map((x, n) => n === i ? { ...x, descripcion: e.target.value } : x))} /><input className="rounded-lg border p-2" aria-label="Cantidad" type="number" step="0.001" value={c.cantidad} onChange={(e) => setConceptos(conceptos.map((x, n) => n === i ? { ...x, cantidad: e.target.value } : x))} /><input className="rounded-lg border p-2" aria-label="Precio unitario" type="number" step="0.01" value={c.precioUnitario} onChange={(e) => setConceptos(conceptos.map((x, n) => n === i ? { ...x, precioUnitario: e.target.value } : x))} /></div>)}
      <div className="flex flex-wrap gap-2"><Boton variante="ghost" onClick={() => setConceptos([...conceptos, { tipo: "mano_obra", descripcion: "", cantidad: "1", precioUnitario: "0" }])}>Agregar concepto</Boton><Boton onClick={() => guardar()} disabled={busy}>Guardar</Boton><span className="self-center font-semibold">Total: ${conceptos.reduce((s, c) => s + Number(c.cantidad || 0) * Number(c.precioUnitario || 0), 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span></div>
    </section>
    <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Avanzar orden</h2><div className="mt-3 flex flex-wrap gap-2">{(siguientes[orden.estado] ?? []).map((estado) => <Boton key={estado} variante={estado === "cancelado" ? "danger" : "primary"} disabled={busy} onClick={() => guardar({ estado })}>{estado.replaceAll("_", " ")}</Boton>)}</div><ol className="mt-4 space-y-1 text-sm text-slate-600">{orden.cambios.map((c, i) => <li key={i}>{new Date(c.creadoAt).toLocaleString("es-MX")} · {c.estado.replaceAll("_", " ")} · usuario {c.userId}</li>)}</ol></section>
  </main>;
}
