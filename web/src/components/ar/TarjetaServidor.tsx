import Link from "next/link";
import { ESTILOS_AR } from "@/lib/ar-vistas";
import type { listarServidores } from "@/lib/servidores-db";
import { FormularioServidor, RegenerarToken } from "./FormularioServidor";

const ESTILOS = { verde: ESTILOS_AR.produccion, amarillo: ESTILOS_AR.en_desarrollo, rojo: ESTILOS_AR.vencido, "sin-datos": ESTILOS_AR.por_confirmar };
type ServidorVista = Awaited<ReturnType<typeof listarServidores>>[number];

export function TarjetaServidor({ servidor: s }: { servidor: ServidorVista }) {
  const estilo = ESTILOS[s.estado];
  const historial = s.historial;
  const inicio = s.inicioHistorial.getTime();
  const puntos = (campo: "ramPct" | "cpuPct" | "discoPct") => historial.map(h => `${Math.max(0, (h.fecha.getTime() - inicio) / 86400000 * 300)},${100 - h[campo]}`).join(" ");
  return <article className={`surface min-w-0 !border-l-4 p-5 ${estilo.borde}`} data-servidor-id={String(s.id)}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-xl font-semibold">{s.nombre}</h2><p className="mt-1 text-xs text-muted-foreground">{s.proveedor} · {s.ip} · {s.propietario}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${estilo.badge}`}>{s.activo ? s.estado === "sin-datos" ? "Sin datos" : s.estado : "Inactivo"}</span></div>
    <p className="my-4 text-sm font-medium">{s.motivo}</p>
    <div className="space-y-3">{([["RAM", s.ultimo?.ramPct], ["CPU", s.ultimo?.cpuPct], ["Disco", s.ultimo?.discoPct]] as const).map(([nombre, valor]) => <div key={nombre}><div className="mb-1 flex justify-between text-xs"><span>{nombre}</span><span>{valor === undefined ? "Sin datos" : `${valor.toFixed(1)} %`}</span></div><div role="meter" aria-label={nombre} aria-valuemin={0} aria-valuemax={100} aria-valuenow={valor} className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${valor === undefined ? "bg-slate-400" : valor >= 90 ? "bg-red-600" : valor >= 80 ? "bg-amber-600" : "bg-emerald-600"}`} style={{ width: `${valor ?? 0}%` }} /></div></div>)}</div>
    <div className="my-4 grid gap-2 text-sm sm:grid-cols-2"><p>{s.diasParaVencer === null ? "Vencimiento por confirmar" : s.diasParaVencer < 0 ? `Venció hace ${-s.diasParaVencer} días` : `Vence en ${s.diasParaVencer} días`}</p><p>{s.costoAnualMxn === null ? "Costo por confirmar" : `$${s.costoAnualMxn.toFixed(2)} MXN / año`}</p><p className="text-xs text-muted-foreground">{s.ramTotalMb === null ? "RAM total por confirmar" : `${s.ramTotalMb} MB RAM`} · {s.loPagamos ? "Lo paga AR" : "Pago externo"}</p>{s.ultimo && <p className="text-xs text-muted-foreground">Uptime {s.ultimo.uptimeHoras.toFixed(1)} h</p>}</div>
    <section className="border-t pt-3"><h3 className="text-sm font-semibold">Últimas 24 h</h3>{historial.length ? <><svg viewBox="0 0 300 100" className="mt-3 h-20 w-full" role="img" aria-label="Historial de RAM, CPU y disco en porcentaje"><path d="M0 20H300M0 10H300" stroke="currentColor" strokeDasharray="3 3" className="text-muted-foreground" />{([ ["ramPct", "#059669"], ["cpuPct", "#2563eb"], ["discoPct", "#d97706"] ] as const).map(([campo, color]) => <polyline key={campo} points={puntos(campo)} fill="none" stroke={color} strokeWidth="2" />)}</svg><p className="mt-1 text-xs text-muted-foreground">RAM verde · CPU azul · Disco ámbar · {historial.length} reportes</p></> : <p className="py-3 text-xs text-muted-foreground">Sin reportes en las últimas 24 horas.</p>}</section>
    <section className="mt-4 border-t pt-3"><h3 className="text-sm font-semibold">Cargas</h3><ul className="mt-2 space-y-1 text-sm">{s.contratos.map(c => <li key={String(c.id)}><Link className="break-words text-primary hover:underline" href={`/contratos/${c.id}`}>{c.contacto.nombre} · {c.tipo.replaceAll("_", " ")}{c.estado === "baja" ? " (baja)" : ""}</Link></li>)}{s.cargasLibres?.split("\n").filter(Boolean).map((c, i) => <li key={i} className="break-words">{c}</li>)}</ul>{!s.contratos.length && !s.cargasLibres && <p className="mt-2 text-xs text-muted-foreground">Cargas por confirmar.</p>}</section>
    {s.notas && <p className="mt-4 whitespace-pre-line break-words text-xs text-muted-foreground">{s.notas}</p>}
    <div className="mt-4 flex flex-wrap gap-2 border-t pt-4"><FormularioServidor id={String(s.id)} valores={{ nombre: s.nombre, proveedor: s.proveedor, ip: s.ip, propietario: s.propietario, loPagamos: s.loPagamos, activo: s.activo, costoAnualMxn: s.costoAnualMxn?.toString() ?? "", vence: s.vence?.toISOString().slice(0, 10) ?? "", ramTotalMb: s.ramTotalMb?.toString() ?? "", notas: s.notas ?? "", cargasLibres: s.cargasLibres ?? "" }} /><RegenerarToken id={String(s.id)} /></div>
  </article>;
}
