import { CLAVES_COLOR, COLORES_AUDITORIA, type ColorAuditoria } from "@/lib/auditoria";

export function AuditoriaResumen({
  total,
  resumen,
}: {
  total: number;
  resumen: Record<ColorAuditoria, number>;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Evaluaciones</p>
        <p className="mt-1 text-2xl font-bold text-foreground">{total}</p>
      </div>
      {CLAVES_COLOR.map((clave) => {
        const definicion = COLORES_AUDITORIA[clave];
        return (
          <div key={clave} className="rounded-xl border border-border bg-card p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${definicion.punto}`} aria-hidden="true" />
              {definicion.titulo}
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">{resumen[clave] ?? 0}</p>
          </div>
        );
      })}
    </div>
  );
}
