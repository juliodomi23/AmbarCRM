"use client";

import Link from "next/link";
import { EncabezadoPagina } from "@/components/ui";

type Recordatorio = { id: string; tipo: string; proximoKm: number | null; proximaFecha: string | null; vehiculo: { id: string; placa: string; marca: string; modelo: string; kilometraje: number; contacto: { nombre: string; telefono: string | null } } };
export function TallerRecordatorios({ recordatorios }: { recordatorios: Recordatorio[] }) {
  const ahora = new Date();
  const estaVencido = (r: Recordatorio) => (r.proximaFecha ? new Date(`${r.proximaFecha.slice(0, 10)}T23:59:59`) < ahora : false) || (r.proximoKm !== null && r.vehiculo.kilometraje >= r.proximoKm);
  const vencidos = recordatorios.filter(estaVencido), proximos = recordatorios.filter((r) => !estaVencido(r));
  const lista = (items: Recordatorio[]) => items.length ? <ul className="divide-y rounded-xl border bg-white">{items.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{r.tipo} · {r.vehiculo.placa}</p><p className="text-sm text-slate-600">{r.vehiculo.marca} {r.vehiculo.modelo} · {r.vehiculo.contacto.nombre} · {r.vehiculo.kilometraje.toLocaleString("es-MX")} km</p><p className="text-sm text-slate-500">{r.proximaFecha ? `Fecha: ${r.proximaFecha.slice(0, 10)}` : ""}{r.proximaFecha && r.proximoKm ? " · " : ""}{r.proximoKm ? `A los ${r.proximoKm.toLocaleString("es-MX")} km` : ""}</p></div><Link className="rounded-lg border px-3 py-2 text-sm" href={`/taller/vehiculos/${r.vehiculo.id}`}>Abrir vehículo</Link></li>)}</ul> : <p className="rounded-xl border bg-white p-6 text-sm text-slate-500">No hay recordatorios en esta lista.</p>;
  return <main className="mx-auto max-w-6xl space-y-6 p-6"><EncabezadoPagina titulo="Recordatorios de servicio" descripcion="Seguimiento manual por fecha y kilometraje." acciones={<><Link className="rounded-lg border px-3 py-2 text-sm" href="/taller">Vehículos</Link><Link className="rounded-lg border px-3 py-2 text-sm" href="/taller/ordenes">Órdenes</Link></>} /><section className="space-y-3"><h2 className="text-lg font-semibold text-red-800">Vencidos ({vencidos.length})</h2>{lista(vencidos)}</section><section className="space-y-3"><h2 className="text-lg font-semibold">Próximos ({proximos.length})</h2>{lista(proximos)}</section></main>;
}
