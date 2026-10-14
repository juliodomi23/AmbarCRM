import Link from "next/link";
import type { resumenAlertas } from "@/lib/servidores";
import { ESTILOS_AR } from "@/lib/ar-vistas";

export function AlertasAR({ alertas }: { alertas: ReturnType<typeof resumenAlertas> }) {
  return <section className="surface min-w-0 space-y-3 p-5" aria-label="Alertas de la plataforma"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Alertas de hoy</h2><p className="text-sm">🔴 {alertas.rojas} · 🟡 {alertas.amarillas}</p></div>{!alertas.lista.length ? <p className="text-sm text-emerald-800 dark:text-emerald-200">Nada en rojo hoy. 🟢</p> : <ul className="space-y-2">{alertas.lista.map((a, i) => <li key={i} className={`rounded-lg border-l-4 p-3 text-sm ${a.nivel === "rojo" ? ESTILOS_AR.vencido.badge + " " + ESTILOS_AR.vencido.borde : ESTILOS_AR.en_desarrollo.badge + " " + ESTILOS_AR.en_desarrollo.borde}`}><Link href={a.donde} className="block break-words hover:underline">{a.nivel === "rojo" ? "🔴" : "🟡"} {a.texto}</Link></li>)}</ul>}<p className="text-xs text-muted-foreground">El envío diario lo realiza n8n.</p></section>;
}
