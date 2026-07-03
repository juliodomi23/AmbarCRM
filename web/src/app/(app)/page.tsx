import Link from "next/link";
import { getMetricasDashboard, getPrimerosPasos } from "@/lib/services/dashboard";
import { getSesion } from "@/lib/session";
import { IconoDescargar } from "@/components/icons";
import { PrimerosPasos } from "@/components/PrimerosPasos";

export const dynamic = "force-dynamic";

function moneda(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v);
}

function Kpi({ titulo, valor, sub, href, acento = "text-navy" }: { titulo: string; valor: string; sub?: string; href?: string; acento?: string }) {
  const card = (
    <div className="rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-bold ${acento}`}>{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

export default async function DashboardPage() {
  const session = await getSesion();
  const esAdmin = session?.user?.rol === "admin";
  const [m, pasos] = await Promise.all([getMetricasDashboard(), esAdmin ? getPrimerosPasos() : null]);
  const hoy = new Date();
  const mes = hoy.toLocaleDateString("es-MX", { month: "long" });
  const iniMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const finMes = hoy.toISOString().slice(0, 10);
  const maxEtapa = Math.max(1, ...m.porEtapa.map((e) => e.valor));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-xl font-bold text-navy">Inicio</h1>

      {pasos && <PrimerosPasos pasos={pasos} />}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Pipeline abierto" valor={moneda(m.pipelineValor)} sub={`${m.pipelineCount} oportunidades`} href="/embudos" />
        <Kpi titulo={`Ganado en ${mes}`} valor={moneda(m.ganadasValor)} sub={`${m.ganadasCount} cerradas`} acento="text-green-600" href="/embudos" />
        <Kpi titulo="Conversión del mes" valor={`${m.conversion}%`} sub={`${m.ganadasCount} ganadas · ${m.perdidasCount} perdidas`} />
        <Kpi titulo="Tareas urgentes" valor={String(m.tareasUrgentes)} sub="vencen hoy o antes" acento={m.tareasUrgentes > 0 ? "text-red-600" : "text-navy"} href="/tareas" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi titulo={`Leads en ${mes}`} valor={String(m.leadsMes)} href="/contactos" />
        <Kpi titulo="Chats abiertos" valor={String(m.convAbiertas)} href="/chat" />
        <Kpi
          titulo="Satisfacción (CSAT)"
          valor={m.csatPromedio != null ? `${m.csatPromedio} / 5` : "—"}
          sub={`${m.csatRespuestas} respuestas en ${mes}`}
          acento={m.csatPromedio != null && m.csatPromedio >= 4 ? "text-green-600" : "text-navy"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pipeline por etapa */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-600">
            Pipeline por etapa{m.embudoNombre ? ` · ${m.embudoNombre}` : ""}
          </h2>
          {m.porEtapa.length === 0 && <p className="py-4 text-sm text-slate-400">No hay embudo configurado.</p>}
          <div className="space-y-3">
            {m.porEtapa.map((e) => (
              <div key={e.nombre}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">{e.nombre} <span className="text-slate-400">({e.count})</span></span>
                  <span className="text-slate-500">{moneda(e.valor)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${Math.round((e.valor / maxEtapa) * 100)}%`, background: e.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ranking de agentes */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-600">Ranking de ventas · {mes}</h2>
          {m.ranking.length === 0 && <p className="py-4 text-sm text-slate-400">Aún no hay ventas cerradas este mes.</p>}
          <div className="divide-y divide-slate-100">
            {m.ranking.map((r, i) => (
              <div key={r.nombre} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-navy/10 text-xs font-bold text-navy">{i + 1}</span>
                  {r.nombre}
                </span>
                <span className="text-sm text-slate-600">
                  <span className="font-semibold text-green-600">{moneda(r.valor)}</span>
                  <span className="ml-2 text-xs text-slate-400">{r.count} ventas</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reportes descargables */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">Reportes (CSV)</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <a href={`/api/reportes/oportunidades?desde=${iniMes}&hasta=${finMes}`} download
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-navy hover:bg-slate-50"><IconoDescargar className="h-4 w-4" /> Oportunidades ({mes})</a>
          <a href="/api/reportes/oportunidades" download
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-navy hover:bg-slate-50"><IconoDescargar className="h-4 w-4" /> Oportunidades (todo)</a>
          <a href={`/api/reportes/csat?desde=${iniMes}&hasta=${finMes}`} download
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-navy hover:bg-slate-50"><IconoDescargar className="h-4 w-4" /> CSAT ({mes})</a>
        </div>
      </div>
    </div>
  );
}
