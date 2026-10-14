type Reporte = { fecha: Date; ramPct: number; cpuPct: number; discoPct: number };
const SERIES = [
  { campo: "ramPct", nombre: "RAM", color: "text-success", trazo: undefined },
  { campo: "cpuPct", nombre: "CPU", color: "text-info", trazo: "5 3" },
  { campo: "discoPct", nombre: "Disco", color: "text-warning", trazo: "2 3" },
] as const;

export function HistorialServidor({ historial, inicio }: { historial: Reporte[]; inicio: Date }) {
  const x = (fecha: Date) => 40 + Math.max(0, Math.min(1, (fecha.getTime() - inicio.getTime()) / 86400000)) * 310;
  const y = (valor: number) => 112 - valor;
  const fecha = (valor: Date) => valor.toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const estable = historial.length > 1 && SERIES.every(({ campo }) => historial.every(h => h[campo] === historial[0][campo]));

  return <section className="border-t pt-4" aria-label="Historial de recursos">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Últimas 24 h</h3><span className="text-xs text-muted-foreground">{historial.length} {historial.length === 1 ? "reporte" : "reportes"}</span></div>
    {historial.length ? <>
      <ul className="mt-3 flex flex-wrap gap-4 text-xs" aria-label="Series del historial">{SERIES.map(serie => <li key={serie.campo} className="flex items-center gap-1.5"><svg viewBox="0 0 20 8" className={`h-2 w-5 ${serie.color}`} aria-hidden="true"><path d="M0 4H20" stroke="currentColor" strokeWidth="2" strokeDasharray={serie.trazo} /></svg>{serie.nombre}</li>)}</ul>
      <svg viewBox="-16 0 376 132" className="mt-2 w-full" role="img" aria-label="Uso de RAM, CPU y disco; escala de 0 a 100 por ciento">
        <desc>{SERIES.map(({ campo, nombre }) => `${nombre}: primer reporte ${historial[0][campo].toFixed(1)} %, último ${historial[historial.length - 1][campo].toFixed(1)} %`).join(". ")}. Los puntos indican reportes recibidos; no se extrapolan datos.</desc>
        {[0, 50, 100].map(valor => <g key={valor} className="text-muted-foreground"><path d={`M40 ${y(valor)}H350`} stroke="currentColor" opacity="0.2" /><text x="32" y={y(valor) + 4} textAnchor="end" fill="currentColor" fontSize="12">{valor} %</text></g>)}
        {SERIES.map(({ campo, color, trazo }) => <g key={campo} className={color}>
          <polyline points={historial.map(h => `${x(h.fecha)},${y(h[campo])}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={trazo} strokeLinejoin="round" />
          {historial.map((h, i) => <circle key={i} cx={x(h.fecha)} cy={y(h[campo])} r={historial.length < 4 ? 3 : 1.5} fill="currentColor"><title>{`${fecha(h.fecha)} · ${h[campo].toFixed(1)} %`}</title></circle>)}
        </g>)}
      </svg>
      <div className="flex justify-between gap-3 text-[11px] text-muted-foreground"><span>{fecha(inicio)}</span><span className="text-right">{fecha(new Date(inicio.getTime() + 86400000))}</span></div>
      {historial.length === 1 ? <p className="mt-2 text-xs text-muted-foreground">Un solo reporte; aún no hay tendencia.</p> : historial.length < 4 ? <p className="mt-2 text-xs text-muted-foreground">Pocos reportes; cada punto es una lectura recibida.{estable && " Valores estables."}</p> : estable && <p className="mt-2 text-xs text-muted-foreground">Valores estables en los reportes disponibles.</p>}
    </> : <p className="my-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">Sin reportes en las últimas 24 horas. El historial aparecerá al recibir la primera lectura.</p>}
  </section>;
}
