"use client";

import { useEffect, useState } from "react";
import { Boton, EncabezadoPagina } from "@/components/ui";

type Cotizacion = { numero: string; total: string; vehiculo: { placa: string; marca: string; modelo: string }; conceptos: { id: string; tipo: string; descripcion: string; cantidad: string; precioUnitario: string }[] };
export function TallerAprobacionPublica({ token }: { token: string }) {
  const [orden, setOrden] = useState<Cotizacion | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState("");
  useEffect(() => { fetch(`/api/taller-aprobacion/${encodeURIComponent(token)}`).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setOrden(d.orden); }).catch((e) => setError(e instanceof Error ? e.message : "No se pudo abrir la aprobación")); }, [token]);
  async function responder(decision: "aprobar" | "rechazar") {
    setBusy(true); try { const r = await fetch(`/api/taller-aprobacion/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setDone(decision === "aprobar" ? "Aprobaste la reparación." : "Solicitaste revisar el diagnóstico."); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo registrar la respuesta"); } finally { setBusy(false); }
  }
  if (error) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>;
  if (done) return <p className="rounded-xl border bg-white p-6 text-center text-lg">{done}</p>;
  if (!orden) return <p className="p-6 text-center">Cargando cotización…</p>;
  return <section className="space-y-5 rounded-2xl border bg-white p-6"><EncabezadoPagina titulo={`Aprobación de orden #${orden.numero}`} descripcion={`${orden.vehiculo.marca} ${orden.vehiculo.modelo} · ${orden.vehiculo.placa}`} /><div className="divide-y">{orden.conceptos.map((c) => <div key={c.id} className="flex justify-between gap-4 py-3 text-sm"><span>{c.descripcion} · {c.cantidad} × ${Number(c.precioUnitario).toFixed(2)}</span><b>${(Number(c.cantidad) * Number(c.precioUnitario)).toFixed(2)}</b></div>)}</div><p className="text-right text-xl font-bold">Total: ${Number(orden.total).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p><p className="text-sm text-slate-600">Al aprobar, autorizas que el taller inicie los trabajos descritos.</p><div className="flex gap-3"><Boton disabled={busy} onClick={() => responder("aprobar")}>Aprobar reparación</Boton><Boton variante="ghost" disabled={busy} onClick={() => responder("rechazar")}>Solicitar revisión</Boton></div></section>;
}
