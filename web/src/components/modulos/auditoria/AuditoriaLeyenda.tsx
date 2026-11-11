import { CLAVES_COLOR, COLORES_AUDITORIA } from "@/lib/auditoria";

export function AuditoriaLeyenda() {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">Código de semáforo</h2>
        <p className="text-xs text-muted-foreground">El mismo código se usa en todas las áreas y periodos.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {CLAVES_COLOR.map((clave) => {
          const definicion = COLORES_AUDITORIA[clave];
          return (
            <div key={clave} className="flex items-start gap-2 rounded-lg border border-border/70 bg-background/40 p-3">
              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${definicion.punto}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  {definicion.titulo}
                  <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {definicion.valor ?? "—"}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{definicion.descripcion}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
