import Link from "next/link";

export function Sparkline({ datos, color = "hsl(var(--primary))" }: { datos: number[]; color?: string }) {
  if (datos.length < 2) return null;
  const max = Math.max(...datos, 1);
  const min = Math.min(...datos);
  const puntos = datos.map((valor, i) => `${(i / (datos.length - 1)) * 100},${30 - ((valor - min) / Math.max(1, max - min)) * 25}`).join(" ");
  return <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-24" aria-label="Tendencia"><polyline points={puntos} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></svg>;
}

export function KpiCard({ titulo, valor, detalle, href, rail = "bg-primary", datos = [], tendencia }: {
  titulo: string; valor: string; detalle?: string; href?: string; rail?: string; datos?: number[]; tendencia?: number | null;
}) {
  const contenido = <div className="surface surface-lift relative min-h-32 overflow-hidden p-4 pl-5 transition-transform hover:-translate-y-0.5"><span className={`absolute inset-y-0 left-0 w-1 ${rail}`}/><p className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{titulo}</p><div className="mt-3 flex items-end justify-between gap-3"><div><p className="tnum text-2xl font-bold tracking-tight">{valor}</p>{detalle && <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>}{tendencia != null && <p className={`tnum mt-1 text-xs font-medium ${tendencia >= 0 ? "text-success" : "text-destructive"}`}>{tendencia >= 0 ? "↗" : "↘"} {Math.abs(tendencia)}% vs. semana anterior</p>}</div><Sparkline datos={datos}/></div></div>;
  return href ? <Link href={href}>{contenido}</Link> : contenido;
}
