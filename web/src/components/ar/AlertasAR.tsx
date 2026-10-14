import Link from "next/link";
import type { resumenAlertas } from "@/lib/servidores";
import { ESTILOS_AR } from "@/lib/ar-vistas";

export function AlertasAR({ alertas }: { alertas: ReturnType<typeof resumenAlertas> }) {
  return <section className="surface min-w-0 space-y-3 p-4 sm:p-5" aria-label="Alertas de la plataforma">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Alertas de hoy</h2><p className="text-xs text-muted-foreground">{alertas.rojas} críticas · {alertas.amarillas} de atención</p></div>
    {!alertas.lista.length ? <p className="text-sm text-success">Sin alertas hoy.</p> : <ul className="space-y-2">{alertas.lista.map((a, i) => <li key={i} className={`rounded-lg border-l-4 text-sm ${a.nivel === "rojo" ? ESTILOS_AR.vencido.badge + " " + ESTILOS_AR.vencido.borde : ESTILOS_AR.en_desarrollo.badge + " " + ESTILOS_AR.en_desarrollo.borde}`}>
      <Link href="/servidores" className="block min-h-11 rounded-lg p-3 hover:underline">
        <span className="mb-1 flex items-center gap-2 text-xs font-semibold"><span aria-hidden="true">{a.nivel === "rojo" ? "!" : "△"}</span>{a.nivel === "rojo" ? "Crítica" : "Atención"}</span>
        <span className="break-words [overflow-wrap:anywhere]">{a.texto}</span>
        <span className="mt-1 block text-xs">Ver servidores →</span>
      </Link>
    </li>)}</ul>}
    <p className="text-xs text-muted-foreground">El envío diario lo realiza n8n.</p>
  </section>;
}
